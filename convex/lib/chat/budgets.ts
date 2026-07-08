/**
 * Central cost/size budgets for the chat pipeline. Every cap that affects
 * token spend or context size lives here — tune cost from one file.
 */

/** Chat history: newest messages included in the model context. */
export const HISTORY_CONTEXT_MESSAGES = 12;
/** Chat history: max characters per included message (recent tier — see below). */
export const HISTORY_MESSAGE_CHARS = 2000;
/** Chat history: how many of the newest messages get the full char budget. */
export const HISTORY_RECENT_TIER_MESSAGES = 4;
/** Chat history: char cap for older messages within the window (still useful, less critical). */
export const HISTORY_OLDER_MESSAGE_CHARS = 500;

/** Agent loop: max planner iterations per turn. */
export const MAX_ITERATIONS = 4;
/** Planner completion cap. */
export const MAX_COMPLETION_TOKENS = 2048;
export const PLANNER_TEMPERATURE = 0.3;

/** Recent-memories cache pulled once per turn for grounding/list tools. */
export const RECENT_MEMORIES_LIMIT = 100;

/** Semantic search: internal fetch size and results surfaced to the model. */
export const SEARCH_FETCH_LIMIT = 12;
export const SEARCH_RESULTS_TOP = 10;

/** Grounding context caps. */
export const GROUNDING_RESULTS_TOP = 8;
export const GROUNDING_RECENT_TOP = 12;
export const GROUNDING_RECENT_FETCH = 40;
/** Only ship the recent-memories fallback block when search itself found this few (or fewer) hits. */
export const GROUNDING_RECENT_FALLBACK_MAX_SEARCH_COUNT = 2;

/** Compact memory projection content cap (bulk tool results). */
export const MEMORY_COMPACT_CONTENT_CHARS = 300;
/** Persisted card snapshots: display-only text caps to keep chat rows small. */
export const CARD_SNAPSHOT_TITLE_CHARS = 160;
export const CARD_SNAPSHOT_CONTENT_CHARS = 420;

/** Diary excerpt budgets per consumer. */
export const DIARY_TOOL_EXCERPT_CHARS = 1500;
export const DIARY_ANALYZE_EXCERPT_CHARS = 200;
export const DIARY_TOOL_LIMIT_DEFAULT = 5;
export const DIARY_TOOL_LIMIT_MAX = 15;
export const DIARY_TOOL_INSIGHTS_MAX = 5;
export const DIARY_STATS_FETCH = 30;
export const DIARY_ANALYZE_FETCH = 15;

/** Generic list tool caps. */
export const LIST_LIMIT_DEFAULT = 20;
export const LIST_LIMIT_MAX = 50;
export const HISTORY_TOOL_LIMIT_DEFAULT = 10;
export const HISTORY_TOOL_LIMIT_MAX = 20;

/** Streaming status preview text cap. */
export const STATUS_TEXT_MAX = 42;

/**
 * Excerpt of a linked attachment's extracted text folded into the parent
 * memory's embedding text (memories.attachmentExcerpt) so search_memories
 * can retrieve it after the upload turn — see foldAttachmentIntoMemory.ts.
 */
export const ATTACHMENT_EXCERPT_CHARS = 1200;

/** Minimum interval between streamed reply content patches (mutation cost cap). */
export const STREAM_PATCH_INTERVAL_MS = 400;
