# Memora AI Pipeline & Backend Architecture Guide

How to extend the system without regressions, redundancy, or cost creep. Written after the 2026-07 full-pipeline revamp. Read this before touching chat, search, cards, or the AI dispatch layer.

## Core invariants (do not break)

1. **Zero added AI calls per chat turn.** New context features must come from DB queries (like the knowledge digest), not extra completions. Embeddings are write-time only — one per entity, reused forever. Query embeddings are cache-first (`searchQueryCache`).
2. **Convex file path = public API namespace.** Never move an exported `query`/`mutation`/`action` to another file — it renames `api.<file>.<fn>` and breaks clients. Move handler _logic_ to `convex/model/*` or `convex/lib/*` and keep a thin registration in place.
3. **Message content is clean text; structure lives in `chatMessages.meta`.** Never embed data in message content. There is no marker protocol — the model reports which memories it used as a mandatory tool argument (see invariant 8), not as optional inline markup.
4. **All AI-emitted IDs pass one validation gate** before persisting: `validateCardIds` in `lib/chat/turnState.ts` (normalizeId + ownership + active check, split by table). Never trust model-emitted IDs anywhere else.
5. **Prompt ordering is a caching contract**: static system prompt first, knowledge digest second, chat history third, per-turn context after. Keep the system prompt byte-stable across turns (only the timestamp block varies) so provider prompt caching keeps hitting.
6. **Every cost knob lives in `convex/lib/chat/budgets.ts`.** New caps/limits/excerpt lengths go there, not inline.
7. **`"use node"` propagates.** Any `convex/lib` module that (transitively) imports a node-tainted module (`aiDispatch`, `semanticSearch`, `attachmentExtraction`, `aiSecrets`) needs `"use node"` at the top, or deploy fails with an unhelpful "Node APIs" error.
8. **The final answer is always a forced tool call, never freeform text.** Every planner iteration runs with `tool_choice: "required"` + `parallel_tool_calls: false`; the model ends a turn by calling `respond({message, used_ids})` (`lib/chat/tools/respond.ts`) — never by returning plain content. `used_ids` is a mandatory argument, not a voluntary follow-up, which is what makes card selection reliable without a second completion call. `message` streams to the user via a live JSON-argument extractor (`lib/streamJsonField.ts`, wired in `providers/openai.ts`'s `streamToolTextField`), so it still reads as ordinary streamed text. Don't reintroduce a freeform "just answer in text" exit path or a nag/retry completion to recover missing IDs — that was the previous design and it doubled AI cost on most grounded turns.

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

### Add an AI provider

One adapter file in `convex/lib/providers/` implementing `AiProviderAdapter` + entry in `ADAPTERS` (`aiDispatch.ts`). `chatCompletionStream` is optional — dispatch falls back to non-streaming automatically. Update `PROVIDER_MODELS` / routing in `lib/ai.ts`, and add a row in `lib/aiPricing.ts`'s default catalog for every `(provider, model, operation)` triple you route to — a missing row silently records cost as `unavailable`/$0, not an error. Errors thrown by the adapter's raw HTTP call must carry a `.status` (see `googleFetchJson` in `providers/google.ts`) so `isRetryableAiError`/`withRetry` in `aiDispatch.ts` can actually retry them — a plain `Error` with the code only in the message string never matches and skips both retry and the admin-configured fallback route (`resolveAiFallbackRoute`, wired into `trackedChatCompletion`/`trackedChatCompletionStream`).

### Add backend domain logic

Put it in `convex/model/<domain>/` as plain functions taking `(ctx, args)`. Existing homes: `model/memories/{helpers,topicLinks,deletion,keywordSearch}.ts`, `model/analytics/aggregates.ts`. Thin registrations stay in the root convex file.

## Chat turn lifecycle (memoryChat.ts, ~550 lines)

auth → send user msg → **grounding search fired concurrently** with history+digest fetch and attachment extraction → conversation assembly (prompt-order invariant) → agent loop (≤`MAX_ITERATIONS`, forced tool call per iteration via `trackedChatCompletionStream`, registry dispatch, ends when `respond` runs) → finalize: `validateCardIds`, build meta, `replyStreamer.finalize({content, meta})`.

Streaming: `lib/chat/replyStreamer.ts` — assistant doc created lazily on first visible text (`streaming: true`), patched ≥400ms apart in order. The visible text is the `respond` tool call's `message` argument, extracted live from streaming JSON (never raw markup, so nothing needs stripping). Client (`useChatController`) drops the progress bubble once a streaming assistant message exists.

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

## Known open items (as of 2026-07-08)

- No automated tests — highest-value next investment (`convex-test` over validation gate, fuseSource ranking, tool registry).
- No per-user AI spend caps — analytics records exact cost per request; enforce in `resolveAiRoute` when needed.
- Google provider has no streaming adapter (falls back to non-streaming — chat reply appears all at once for Google-routed turns instead of token-by-token).
- Diary card "View in Diary" opens the tab, not the specific entry (no deep link).
- `conversationId` exists on chatMessages but UI is single-conversation.
- A global/admin embedding-route change doesn't rebuild existing users' stored vectors (only the per-user BYOK change path does, via `rebuildUserEmbeddings`) — the query-cache fingerprint check (`searchQueryCache.embeddingFingerprint`, see `semanticSearch.ts`) stops a _stale query vector_ from being served, but a corpus left half-migrated between two embedding spaces is still a relevance/dimension problem an admin-side route change can create.
- Diary embeddings and memory embeddings are both retried by 6h crons now (`backfill` / `backfillDiary` in `backfillEmbeddings.ts`, wired in `crons.ts`) — a transient embed failure at write time is recoverable, but a hard dimension mismatch (wrong model selected) will just fail every retry silently forever; there's no alerting on a memory stuck in `embeddingState: "missing"` past N retries.
- Attachment text search (`memories.attachmentExcerpt`, folded in by `foldAttachmentIntoMemory.ts`) covers the vector channel only, not the `search_content` fulltext index (which still reads `content` only) — a receipt photo's extracted text is semantically searchable but won't match an exact-keyword fulltext hit unless it also happens to score well on vectors.
