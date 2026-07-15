# Improvement Pass — July 2026

Broad quality pass across diary, AI chat, admin panel, and app infra. All phases
typechecked, unit-tested (25 passing), and deployed to Convex dev. Companion
invariants live in `agent-context/ai-architecture.md`.

## Phase 0 — Bug fixes and cheap perf wins

- Removed `components/MoodTrendStrip.tsx` (Rules-of-Hooks violation; superseded by Diary Insights).
- Chat list renders split into stable base rows + memoized status rows so tool-progress ticks no longer re-render every bubble (`components/chat-sheet/useChatController.ts`).
- Typewriter reveal paces to the ~400ms server patch cadence, drains instantly once streaming ends (`components/ai-chat/streamReveal.ts`).
- Admin timeline compare series aligned by `dayKey` shift instead of array index (`convex/admin.ts`).
- `.gitignore` covers stray `**/.convex/` sqlite artifacts.

## Phase 1 — Diary overhaul

**Backend** (`convex/diary.ts`, logic in `convex/model/diary/insights.ts`):

- `listPaginated` — real pagination with optional mood + date-range filters (new `by_user_mood` index); replaces the old 100-entry cap.
- `getEntry` / `update` — entry detail and editing; edits clear derived fields and re-run the full AI analysis + embedding pipeline (closes the write-once gap).
- `search` — full-text over the existing `search_text` index (no query embedding).
- `calendarSummary` — per-day counts + dominant mood for a month window.
- `insights` — range-bounded rollup: mood/energy distributions, mood-by-day timeline, top topics, habit sentiment, open action items, streak.

**UI**:

- Diary tab (`app/(protected)/(tabs)/diary.tsx`) rebuilt as **Entries | Calendar | Insights** segments: infinite scroll, search bar, mood filter chips, richer cards (`components/diary/DiaryListCard.tsx`).
- New detail route `app/(protected)/diary/[id].tsx`: full text with corrected/original toggle, edit, delete, and all AI sections (summary, topics, insights, habits, likes/dislikes, action items, traits).
- `components/diary/DiaryCalendar.tsx` — month grid colored by dominant mood; tapping a day filters entries. `components/diary/DiaryInsights.tsx` — distribution bars, stats, habits.
- AI chat diary cards deep-link to `/diary/[id]`.

## Phase 2 — AI capabilities

- **Per-user daily spend caps** — enforced in `resolveAiRoute` (`convex/lib/aiDispatch.ts`) against the existing `userAnalyticsDaily` platform-cost aggregate. Default $2/day in `convex/lib/chat/budgets.ts`; per-user override via admin Users screen; BYOK exempt. Over-cap throws a typed, non-retryable `AiSpendCapError`.
- **Stop/cancel** — `chat.requestCancel` sets a flag (`chatCancelRequests`); the planner loop checks it between iterations; partial answers finalize with a `cancelled` marker. Stop button replaces send while streaming.
- **Typed turn errors** — spend cap / provider auth / rate limit / network / cancelled each map to `meta.error.code` with distinct user copy and a Retry pill in the bubble (validators kept in sync across schema, `convex/chat.ts`, `convex/lib/chat/types.ts`, `components/ai-chat/types.ts`).
- **Multi-conversation chat** — `chatConversations` table; thread panel in the sheet (`components/chat-sheet/ConversationList.tsx`) with new chat, inline rename, archive. Auto-title from first-user-message truncation (zero AI calls). Legacy messages (`conversationId` unset) remain the "Main chat" — no migration.
- **Message actions** — copy, edit-and-resend (user), regenerate (assistant; regenerate resends as a new turn, so the user bubble duplicates — deliberate), and TTS speak via `expo-speech`.
- **Google Gemini SSE streaming** — `generateContentStream` + `chatCompletionStream` adapter in `convex/lib/providers/google.ts`; mid-conversation system hints stay in order instead of being folded to the top.
- **Embedding health** — 6h cron flags docs stuck in `embeddingState:"missing"` >24h into `systemAlerts`; surfaced on the admin System screen.
- **Model refresh** — gemini-2.5 GA models + pricing rows added; defaults now gpt-4.1-mini / gemini-2.5-flash. Note: `DEFAULT_ROUTING` seeds fresh deploys only; live routing changes go through AI Ops.

## Phase 3 — Admin reorganization

**Backend correctness** (`convex/admin.ts`, `convex/analytics.ts`):

- Per-render full-table scans replaced by an `adminDailyStats` rollup table written by a 6h cron (`rollupAdminDailyStats`); dashboard/analytics/system read the rollup.
- User search index-backed via denormalized `users.searchText` + search index (backfill migration ran) — previously matched only within the current page.
- Audit log filters index-backed (`by_action_and_created_at`, `by_target_type_and_created_at`) with actor names resolved server-side.
- AI Ops aggregates from `userAnalyticsModelDaily` per-day rows plus a bounded latency sample, replacing newest-1200-events truncation.
- `setUserSpendCap` mutation with audit logging.

**UI**: shared `AdminStatTile` (delta arrows), `AlertBanner`, and chart library (`components/admin/charts/` — `BarChart`, `DonutChart`, fixed categorical palette). Users and Audit screens use `usePaginatedQuery` with load-more; Users gains per-user spend-cap controls; dead `refreshKey` threading removed (Convex is already reactive).

## Phase 4 — Infra hardening

- **FlashList v2** on home feed + diary via `components/ui/AppList.tsx` — FlashList on native, FlatList on web (FlashList's web renderer loops in `commitLayout` with async-settling row heights). Documents grid keeps FlatList (`columnWrapperStyle` unsupported).
- **`components/ui/AppImage.tsx`** — expo-image wrapper with `memory-disk` cache + `recyclingKey`; used in documents grid and attachment bar.
- **`components/ui/ScreenErrorBoundary.tsx`** — retry-able boundary around the protected stack, admin panel, and chat sheet.
- **Offline banner** — `hooks/useNetworkStatus.ts` (netinfo) + `components/ui/OfflineBanner.tsx` in the protected layout.
- **Web fixes** — `components/ui/SheetTextInput.tsx` (plain TextInput on web; gorhom's `BottomSheetTextInput` calls the unimplemented `TextInput.State.currentlyFocusedInput()`); diary insights query args snapshot `Date.now()` per range selection instead of per render (inline now-values resubscribe Convex queries in a setState loop).

## Deferred

- ScrollView→FlatList on review / reminders / knowledge-graph (small bounded lists).
- Non-duplicating regenerate (needs a send-path flag).
- Planner-framework rewrite (hand-rolled loop encodes cost invariants — untouched by design).
- Full on-device regression (native chat streaming, dictation, calendar sync) — only web + CLI smokes were run.
