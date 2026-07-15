# Memora AI Pipeline & Backend Architecture Guide

How to extend the system without regressions, redundancy, or cost creep. Written after the 2026-07 full-pipeline revamp. Read this before touching chat, search, cards, or the AI dispatch layer.

## Core invariants (do not break)

1. **Zero added AI calls per chat turn.** New context features must come from DB queries (like the knowledge digest), not extra completions. Embeddings are write-time only — one per entity, reused forever. Query embeddings are cache-first (`searchQueryCache`).
2. **Convex file path = public API namespace.** Never move an exported `query`/`mutation`/`action` to another file — it renames `api.<file>.<fn>` and breaks clients. Move handler _logic_ to `convex/model/*` or `convex/lib/*` and keep a thin registration in place.
3. **Message content is clean text; structure lives in `chatMessages.meta`.** Never embed data in message content. Every finalized assistant reply persists its planner-turn count and flow/telemetry link there, even when it surfaces no cards; the reply footer opens the cost breakdown from that link. Every AI/search call caused by that turn must forward the same `chatTurnId`, including tool searches and attachment extraction, so its breakdown is complete. There is no marker protocol — the model reports which memories it used as a mandatory tool argument (see invariant 8), not as optional inline markup.
4. **All AI-emitted IDs pass one validation gate** before persisting: `validateCardIds` in `lib/chat/turnState.ts` (normalizeId + ownership + active check, split by table). Never trust model-emitted IDs anywhere else.
5. **Prompt ordering and tool scope are caching/cost contracts**: the compact static system prompt goes first, knowledge digest second, chat history third, and per-turn context after. Keep the prompt byte-stable except for its final timestamp. `getChatToolDefinitions()` keeps the four core tools available and adds intent-specific tools; ambiguous referential follow-ups deliberately receive the full registry. Add specialized intent routing there instead of restoring the full tool schema on every turn.
6. **Every cost knob lives in `convex/lib/chat/budgets.ts`.** New caps/limits/excerpt lengths go there, not inline.
7. **`"use node"` propagates.** Any `convex/lib` module that (transitively) imports a node-tainted module (`aiDispatch`, `semanticSearch`, `attachmentExtraction`, `aiSecrets`) needs `"use node"` at the top, or deploy fails with an unhelpful "Node APIs" error.
8. **The final answer is always a forced tool call, never freeform text.** Every planner iteration uses required tool choice; non-terminal iterations may batch independent tools, while forced-respond iterations disable parallel calls. The model ends through `respond({message, used_ids})` (`lib/chat/tools/respond.ts`). `used_ids` is mandatory, and `message` streams through the JSON-argument extractor in `providers/openai.ts`. Don't reintroduce a freeform exit or a nag/retry completion for missing IDs.
9. **Strong initial grounding is already a DB fetch.** When the authoritative grounding block is strong and contains the required details, the planner should call `respond` directly rather than repeat `search_memories`. Weak, empty, or ambiguous grounding must still run expanded retrieval; exact counts require an exact DB-backed tool result. Keep this distinction aligned across the system prompt, grounding message, and tool descriptions.

## Extension recipes

### Add a chat tool

1. Create `convex/lib/chat/tools/<name>.ts` exporting a `ChatTool`: `{ name, label, definition, buildStatus, handler, kind? }`. `handler(tc, fnArgs)` returns the JSON string given back to the model. `tc: ToolContext` provides ctx, token, userId, userMessage, grounding, knowledgeDigest, `getRecentMemories()` (shared per-turn cache — call `invalidateRecentMemories()` after writes), and `tc.state` (TurnState: `pendingCardIds`, `pendingDeletionItems`, `flowSearches`, `writeToolCalled`, …). Set `kind: "read"` for pure info-gathering tools (no writes) — the agent loop derives its force-respond-after-one-read-tool heuristic from this instead of a hardcoded name list, so a new read tool is picked up automatically.
2. Register it in `REGISTERED_TOOLS` in `tools/index.ts`. Done — dispatch, labels, status UI, and the read-only-tool set all derive from the registry.
3. Compact tool results: reuse `projections.ts` (`toMemoryCompact`, `toDiaryCompact`) and cap sizes via `budgets.ts`. Never return full docs to the model. For any tool result quoting a count derived from a capped list (`getRecentMemories()`, `listForAI`), include the digest's exact total and a `truncated` flag rather than the list length — see `list_memories`/`analyze_memories` in `browseAndStats.ts`.
4. A write tool that resolves its target from free text (no explicit ID) should pass `requireMatchForWrite: true` to `resolveMemoryReference` (`lib/chat/search.ts`) and surface a clear "couldn't confidently match" error on `null` — the zero-score "default to most recent memory" fallback is fine for read-only resolution but a silent wrong-target hazard for writes.

### Add a card type (e.g. reminder or document cards)

1. Schema: extend the `table` union inside `chatMessages.meta.cards` in `schema.ts` AND `chatMessageMetaValidator` in `convex/chat.ts` AND `ChatMessageMeta` in `lib/chat/types.ts` + `CardRef` in `components/ai-chat/types.ts` (keep all four in sync).
2. Backend: make the validation gate recognize it — add a `filterValidCardIds`-style internal query on the new table, wire into `validateCardIds` in `turnState.ts`, emit refs in the finalize block of `memoryChat.ts`.
3. Frontend: new row component in `components/ai-chat/cards/`, a `listByIds`-style public query (args as `v.array(v.string())` + `ctx.db.normalizeId` — never `v.id(...)` for AI-adjacent ID lists), and a section in `SearchResultsCard`.

### Add a searchable table

One source descriptor in `convex/lib/semanticSearch.ts` via `fuseSource()` — declare channels (`vector`/`fulltext`/…, each with boost + `run()`), it reuses the single shared query-embedding promise. Each source ranks in its own RRF pool so it never displaces another source's results. Prereqs on the table: `searchText` denormalized field + search index, `embedding` + vector index (1536 dims), write-time embed in the processing action (feature `"memory_search"` — see gotcha below).

Memory retrieval representations are versioned and centralized in `lib/memoryRetrieval.ts`. Capture, processing, attachment folding, and embedding backfills must use its normalization/search-text/embedding-text builders. The extraction tool must require `semanticSummary`, `searchAliases`, and `searchConcepts`; optional enrichment silently produced a nominally upgraded but semantically empty corpus in v2. Increment `MEMORY_RETRIEVAL_VERSION` whenever stored meaning changes and run `actions/rebuildRetrieval.ts`; inspect progress/failures through `retrievalRebuildJobs:latest`.

Search channels should reuse already-hydrated documents: full-text and scored-keyword hits populate the per-search hydration maps, and only vector-only winners are fetched by ID. Keep keyword topic lookup and scoring inside `memories:searchByKeywordScored` rather than fetching topics twice in the action. Embedding backfills batch provider inputs and persist vectors through the bounded batch mutations in `processMemoryMutations.ts` / `processDiaryMutations.ts`.

Query-time routing is resolved once per semantic search and reused for both the embedding fingerprint and a fresh query embedding. Memory vector and full-text channels start concurrently; the broad recent-memory keyword scan is a fallback only when full-text produces fewer than `SEARCH_KEYWORD_FALLBACK_MIN_DIRECT_HITS` direct hits. Diary fusion must retain channel/vector evidence so a strong diary-only match can satisfy initial grounding without a redundant tool search.

### Add an AI provider

One adapter file in `convex/lib/providers/` implementing `AiProviderAdapter` + entry in `ADAPTERS` (`aiDispatch.ts`). `chatCompletionStream` is optional — dispatch falls back to non-streaming automatically. Update `PROVIDER_MODELS` / routing in `lib/ai.ts`, and add a row in `lib/aiPricing.ts`'s default catalog for every `(provider, model, operation)` triple you route to — a missing row silently records cost as `unavailable`/$0, not an error. Errors thrown by the adapter's raw HTTP call must carry a `.status` (see `googleFetchJson` in `providers/google.ts`) so `isRetryableAiError`/`withRetry` in `aiDispatch.ts` can actually retry them — a plain `Error` with the code only in the message string never matches and skips both retry and the admin-configured fallback route (`resolveAiFallbackRoute`, wired into `trackedChatCompletion`/`trackedChatCompletionStream`).

### Add backend domain logic

Put it in `convex/model/<domain>/` as plain functions taking `(ctx, args)`. Existing homes: `model/memories/{helpers,topicLinks,deletion,keywordSearch}.ts`, `model/analytics/aggregates.ts`. Thin registrations stay in the root convex file.

## Chat turn lifecycle

auth → resolve chat route and send user msg concurrently → clear stale cancel flag + touch conversation (auto-title from first user message — a string truncation, never an AI call) → **grounding search fired concurrently** with history+digest fetch and attachment extraction → remove the just-persisted current user message from history before appending it once as the latest request → conversation assembly → planner uses the same resolved route throughout the turn: strong complete grounding can go directly to `respond`; weak/ambiguous grounding expands through tools → independent read-only calls in one model batch execute concurrently, while writes stay ordered → finalize: `validateCardIds`, build universal reply meta (turn count + flow/performance telemetry, plus optional cards/deletion proposal), `replyStreamer.finalize({content, meta})`.

**Conversations**: `chatConversations` table; `chatMessages.conversationId` holds `String(_id)`. `chat.list`/`chat.clear`/history fetch scope by `by_user_conversation` with `eq(conversationId, undefined)` meaning the "main" thread (pre-threads messages) — no backfill migration exists or is needed. The knowledge digest stays global across conversations.

**Cancel**: Stop button → `chat.requestCancel` sets a per-user `chatCancelRequests` row; the planner loop checks it between iterations (cooperative — mid-completion tokens still bill) and `memoryChat` clears it at turn start and end. A cancelled read-only turn replies "Stopped…" with `meta.error.code = "cancelled"`; committed writes still surface their confirmation + cards.

**Typed turn errors**: failures classify via `classifyTurnError` (memoryChat.ts) into `ChatMessageMeta.error.code` (`spend_cap` | `provider_auth` | `rate_limited` | `network` | `cancelled` | `unknown`; keep schema.ts + convex/chat.ts + lib/chat/types.ts + components/ai-chat/types.ts in sync). ChatBubble renders an error chip with retry (regenerate) for non-spend-cap codes.

**Spend caps**: `resolveAiRoute` enforces a per-user daily cap on **platform-billed** usage only (BYOK exempt, returns before the check). Spend is read from the existing `userAnalyticsDaily.aiMemoraCostUsdMicros` aggregate (no new table); the default cap lives in `budgets.ts` (`DAILY_PLATFORM_SPEND_CAP_USD_MICROS`), per-user override via `userAiProviderPreferences.dailySpendCapUsdMicros` (admin mutation `admin.setUserSpendCap`). Over-cap throws `AiSpendCapError` — deliberately carries no `.status`, so retry/fallback never re-attempt it.

Recent memories are a lazy shared per-turn cache. Pass `getRecentMemories` through search helpers instead of resolving it at the callsite: non-empty semantic searches do not need the list, and weak/empty grounding loads it only as fallback context. Generic and create-only turns should not read the memory list. Reply flow telemetry includes preparation/planner/total latency, tool calls and batches, palette size, and provider-reported cached input tokens.

Streaming: `lib/chat/replyStreamer.ts` — assistant doc created lazily on first visible text (`streaming: true`), patched ≥400ms apart in order. The visible text is the `respond` tool call's `message` argument, extracted live from streaming JSON (never raw markup, so nothing needs stripping). Client (`useChatController`) drops the progress bubble once a streaming assistant message exists.

## Gotchas learned the hard way

- **Forward the inverted list's empty-component style.** `ChatMessageList` uses an inverted virtualized list, which injects its own platform-specific counter-transform into `ListEmptyComponent`. The empty component must apply that received `style`; a hard-coded 180° rotation mirrors its text on web because web inversion uses `scaleY(-1)`.
- **Portalized protected sheets need auth above the modal host.** Keep `AuthContext.Provider` outside `BottomSheetModalProvider` in `app/_layout.tsx`; Gorhom mounts modal content at its provider-level portal host, so putting auth below it makes `ChatSurface` lose `useAuth()` even though the protected route and sheet host can read the context.
- **Dictation modes are selected per flow.** `VoiceRecorder` defaults to `transcriptionMode="cloud"`: `transcriptionJobs` accepts only an authenticated owner’s short-lived Convex Storage upload, validates MIME/size/duration, and deletes the object on terminal processing or cleanup. Send its bytes to `trackedTranscribeAudio` (never base64 through an action argument), use the fixed English language, and return a typed success/error result. Use `transcriptionMode="device"` only when a flow needs native on-device recognition—the chat composer does this. Device mode is native-only, rejects network fallback, explicitly uses Android's `com.google.android.as`, preflights capability/installed language packs (and starts Android's downloader when needed), accumulates Android continuous segments, and keeps every final transcript editable before explicit send/save/apply.
- **Cloud dictation preprocessing is frontend-only.** `VoiceRecorder` records 16 kHz mono PCM through `@siteed/audio-studio`; `lib/audio/transcriptionPreprocessor.ts` removes only sustained silence, applies the code-fixed pitch-preserving 3x WSOLA tempo, and uploads a mono WAV with its processed duration. The recorder simultaneously keeps the original WAV on disk and uploads it on every preprocessing failure. Do not route device dictation through this path, move the DSP into Convex, or add a separate audio service.
- **Embeddings route by feature capability**: `trackedEmbedText` with a `structured_text`-capability feature resolves a chat model and crashes `embeddings.create`. Always use feature `"memory_search"` for embeds; attribute the actual purpose via `stage`/`metadata`.
- **`.order("asc").take(n)` returns the OLDEST n.** For "latest N" always `.order("desc").take(n)` then `.reverse()`. This bug shipped once (chat.list) — don't reintroduce it.
- **AI-emitted ID args**: public queries taking ID lists that a model may have produced must accept `v.array(v.string())` and `normalizeId` each entry. `v.id("table")` throws `ArgumentValidationError` on a foreign-table ID and kills the whole client query.
- **Exact counts come from aggregate tables** (`userMemoryStats` via `diary.getKnowledgeDigestInternal`), never from counting a capped list.
- **Deploy after backend changes**: `bun x convex dev --once`. A stale deployment reproduces "fixed" bugs.
- **Usage tracking with streaming**: keep `stream_options: { include_usage: true }` so token accounting stays exact.
- **Operational writes are deduplicated**: `chat.setSearchStatus` and `chat.patchMessageContent` skip semantically identical updates. Preserve this guard when adding status fields so reactive subscribers are not invalidated by no-op patches.

## Verification checklist per change

1. `bun test`
2. `bun run typecheck`
3. `bun x convex dev --once` (must succeed — watch for "use node" errors)
4. Smoke internal functions directly: `bun x convex run <file>:<fn> '<json>'`, inspect data via `bun x convex data <table>`
5. In-app regression set: chat streams reply; search/diary questions surface cards; create memory/reminder; deletion proposal flow; deep scan; reminder calendar sync.

## Known open items (as of 2026-07-14)

- Retrieval now has Bun/`convex-test` coverage for grounding gates, query normalization, representation building, vector ranking, and ownership filtering. Validation-gate and full fused-channel integration coverage remain worthwhile.
- Google streaming adapter exists (`streamGenerateContent?alt=sse` in `providers/google.ts`); note Gemini delivers function-call args as complete JSON per part, so the `respond` message surfaces in one visible chunk rather than token-by-token. Mid-conversation system hints (grounding, memory-reference) are preserved in order as `[Context note]` user turns instead of being folded into systemInstruction.
- "Regenerate" resends the last user message as a NEW turn (duplicate user bubble by design — the send path always persists the user message; a non-duplicating variant would need a send-path flag).
- A global/admin embedding-route change doesn't rebuild existing users' stored vectors (only the per-user BYOK change path does, via `rebuildUserEmbeddings`) — the query-cache fingerprint check (`searchQueryCache.embeddingFingerprint`, see `semanticSearch.ts`) stops a _stale query vector_ from being served, but a corpus left half-migrated between two embedding spaces is still a relevance/dimension problem an admin-side route change can create.
- Embedding-stuck alerting: `systemAlerts.checkEmbeddingHealth` cron (6h) flags docs in `embeddingState: "missing"` older than 24h into the `systemAlerts` table (admin System screen). `DEFAULT_ROUTING` seeds only on first deploy — changing the constants does NOT retarget an already-seeded deployment; use admin routing for live changes. New (provider, model, operation) triples MUST get a `buildDefaultPricingCatalog` row or cost records as $0/unavailable.
- Diary deep link done: chat diary cards push `/diary/[id]`. Diary UI is paginated (`diary.listPaginated`) with search/calendar/insights; `diary.update` re-runs `processDiary` after clearing derived fields.
