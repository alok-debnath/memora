# Memora AI Pipeline & Backend Architecture Guide

How to extend the system without regressions, redundancy, or cost creep. Written after the 2026-07 full-pipeline revamp. Read this before touching chat, search, cards, or the AI dispatch layer.

## Core invariants (do not break)

1. **Zero added AI calls per chat turn.** New context features must come from DB queries (like the knowledge digest), not extra completions. Embeddings are write-time only — one per entity, reused forever. Query embeddings are cache-first (`searchQueryCache`).
2. **Convex file path = public API namespace.** Never move an exported `query`/`mutation`/`action` to another file — it renames `api.<file>.<fn>` and breaks clients. Move handler _logic_ to `convex/model/*` or `convex/lib/*` and keep a thin registration in place.
3. **Message content is clean text; structure lives in `chatMessages.meta`.** Never embed data in message content. The only marker still alive is `<!--MEMORA_USED_IDS:[...]-->` — an AI-facing fallback protocol, extracted and stripped server-side before persist (`lib/chat/markers.ts`). The client does zero marker parsing.
4. **All AI-emitted IDs pass one validation gate** before persisting: `validateCardIds` in `lib/chat/turnState.ts` (normalizeId + ownership + active check, split by table). Never trust model-emitted IDs anywhere else.
5. **Prompt ordering is a caching contract**: static system prompt first, knowledge digest second, chat history third, per-turn context after. Keep the system prompt byte-stable across turns (only the timestamp block varies) so provider prompt caching keeps hitting.
6. **Every cost knob lives in `convex/lib/chat/budgets.ts`.** New caps/limits/excerpt lengths go there, not inline.
7. **`"use node"` propagates.** Any `convex/lib` module that (transitively) imports a node-tainted module (`aiDispatch`, `semanticSearch`, `attachmentExtraction`, `aiSecrets`) needs `"use node"` at the top, or deploy fails with an unhelpful "Node APIs" error.

## Extension recipes

### Add a chat tool

1. Create `convex/lib/chat/tools/<name>.ts` exporting a `ChatTool`: `{ name, label, definition, buildStatus, handler }`. `handler(tc, fnArgs)` returns the JSON string given back to the model. `tc: ToolContext` provides ctx, token, userId, userMessage, grounding, knowledgeDigest, `getRecentMemories()` (shared per-turn cache — call `invalidateRecentMemories()` after writes), and `tc.state` (TurnState: `pendingCardIds`, `pendingDeletionItems`, `flowSearches`, `writeToolCalled`, …).
2. Register it in `REGISTERED_TOOLS` in `tools/index.ts`. Done — dispatch, labels, status UI all derive from the registry.
3. Compact tool results: reuse `projections.ts` (`toMemoryCompact`, `toDiaryCompact`) and cap sizes via `budgets.ts`. Never return full docs to the model.

### Add a card type (e.g. reminder or document cards)

1. Schema: extend the `table` union inside `chatMessages.meta.cards` in `schema.ts` AND `chatMessageMetaValidator` in `convex/chat.ts` AND `ChatMessageMeta` in `lib/chat/types.ts` + `CardRef` in `components/ai-chat/types.ts` (keep all four in sync).
2. Backend: make the validation gate recognize it — add a `filterValidCardIds`-style internal query on the new table, wire into `validateCardIds` in `turnState.ts`, emit refs in the finalize block of `memoryChat.ts`.
3. Frontend: new row component in `components/ai-chat/cards/`, a `listByIds`-style public query (args as `v.array(v.string())` + `ctx.db.normalizeId` — never `v.id(...)` for AI-adjacent ID lists), and a section in `SearchResultsCard`.

### Add a searchable table

One source descriptor in `convex/lib/semanticSearch.ts` via `fuseSource()` — declare channels (`vector`/`fulltext`/…, each with boost + `run()`), it reuses the single shared query-embedding promise. Each source ranks in its own RRF pool so it never displaces another source's results. Prereqs on the table: `searchText` denormalized field + search index, `embedding` + vector index (1536 dims), write-time embed in the processing action (feature `"memory_search"` — see gotcha below).

### Add an AI provider

One adapter file in `convex/lib/providers/` implementing `AiProviderAdapter` + entry in `ADAPTERS` (`aiDispatch.ts`). `chatCompletionStream` is optional — dispatch falls back to non-streaming automatically. Update `PROVIDER_MODELS` / routing in `lib/ai.ts`.

### Add backend domain logic

Put it in `convex/model/<domain>/` as plain functions taking `(ctx, args)`. Existing homes: `model/memories/{helpers,topicLinks,deletion,keywordSearch}.ts`, `model/analytics/aggregates.ts`. Thin registrations stay in the root convex file.

## Chat turn lifecycle (memoryChat.ts, ~550 lines)

auth → send user msg → **grounding search fired concurrently** with history+digest fetch and attachment extraction → conversation assembly (prompt-order invariant) → agent loop (≤`MAX_ITERATIONS`, streaming planner via `trackedChatCompletionStream`, registry dispatch) → finalize: extract USED_IDS, strip markers, `validateCardIds`, build meta, `replyStreamer.finalize({content, meta})`.

Streaming: `lib/chat/replyStreamer.ts` — assistant doc created lazily on first visible text (`streaming: true`), patched ≥400ms apart in order, partial `<!--` tails withheld so markers never flash. Client (`useChatController`) drops the progress bubble once a streaming assistant message exists.

## Gotchas learned the hard way

- **Embeddings route by feature capability**: `trackedEmbedText` with a `structured_text`-capability feature resolves a chat model and crashes `embeddings.create`. Always use feature `"memory_search"` for embeds; attribute the actual purpose via `stage`/`metadata`.
- **`.order("asc").take(n)` returns the OLDEST n.** For "latest N" always `.order("desc").take(n)` then `.reverse()`. This bug shipped once (chat.list) — don't reintroduce it.
- **AI-emitted ID args**: public queries taking ID lists that a model may have produced must accept `v.array(v.string())` and `normalizeId` each entry. `v.id("table")` throws `ArgumentValidationError` on a foreign-table ID and kills the whole client query.
- **Exact counts come from aggregate tables** (`userMemoryStats` via `diary.getKnowledgeDigestInternal`), never from counting a capped list.
- **Deploy after backend changes**: `bun x convex dev --once`. A stale deployment reproduces "fixed" bugs.
- **Usage tracking with streaming**: keep `stream_options: { include_usage: true }` so token accounting stays exact.

## Verification checklist per change

1. `bun run typecheck`
2. `bun x convex dev --once` (must succeed — watch for "use node" errors)
3. Smoke internal functions directly: `bun x convex run <file>:<fn> '<json>'`, inspect data via `bun x convex data <table>`
4. In-app regression set: chat streams reply; search/diary questions surface cards; create memory/reminder; deletion proposal flow; deep scan; reminder calendar sync.

## Known open items (as of 2026-07-06)

- No automated tests — highest-value next investment (`convex-test` over validation gate, fuseSource ranking, tool registry).
- No per-user AI spend caps — analytics records exact cost per request; enforce in `resolveAiRoute` when needed.
- Google provider has no streaming adapter (falls back to non-streaming).
- Diary card "View in Diary" opens the tab, not the specific entry (no deep link).
- `conversationId` exists on chatMessages but UI is single-conversation.
