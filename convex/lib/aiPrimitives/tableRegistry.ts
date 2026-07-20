import { v, type Validator } from "convex/values";
import { api } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { DIARY_TOOL_EXCERPT_CHARS, MEMORY_COMPACT_CONTENT_CHARS } from "../chat/budgets";

/**
 * Allowlist for the 5 generic AI primitive tools (get/list/create/update/
 * delete_doc — see lib/chat/tools/genericPrimitives.ts). A table not listed
 * here is completely unreachable through the primitives, regardless of what
 * fields a model requests — this is the actual security boundary, not the
 * (necessarily loose) JSON schema shown to the model.
 *
 * Delegates: when create/update/delete has side effects a blind field patch
 * can't replicate (scheduling, token generation, dedupe, related-table
 * writes — e.g. diary.create schedules AI processing, sharing.createShareLink
 * mints a token), route through the existing Convex mutation instead of raw
 * ctx.db. Ownership is always re-checked inside the delegate's own
 * resolveUser-scoped mutation. Only tables with no such side effects (plain
 * cosmetic field patches) use the raw path.
 */
export type AiOp = "get" | "list" | "create" | "update" | "delete";

export type TablePrimitiveConfig = {
  table: string;
  /** Field on the row holding the owning user id — never model-suppliable. */
  ownerField: string;
  allowedOps: Set<AiOp>;
  /** Index used for owner-scoped listing; its first key must be `ownerField`. */
  listIndex: string;
  /** Additional fields that are part of `listIndex` and can be pushed as `.eq()` calls. */
  indexedFilterFields?: string[];
  /** Filters applied when the model doesn't specify them (e.g. status: "active"). */
  defaultFilters?: Record<string, unknown>;
  /** Raw-path field whitelist for create (ignored when createDelegate is set). */
  allowedCreateKeys?: string[];
  /** Raw-path field whitelist for update (ignored when updateDelegate is set). */
  allowedUpdateKeys?: string[];
  /** "soft" patches `statusField` to `deletedStatusValue`; "hard" calls ctx.db.delete. Ignored when deleteDelegate is set. */
  deleteMode?: "soft" | "hard";
  statusField?: string;
  deletedStatusValue?: string;
  /** Route create through an existing side-effect-bearing mutation instead of raw insert. */
  createDelegate?: (
    ctx: MutationCtx,
    token: string,
    userId: Id<"users">,
    fields: Record<string, unknown>,
  ) => Promise<{ id: string }>;
  /** Route update through an existing mutation. Only used for narrow, explicitly modeled transitions. */
  updateDelegate?: (
    ctx: MutationCtx,
    token: string,
    userId: Id<"users">,
    id: string,
    fields: Record<string, unknown>,
  ) => Promise<{ id: string }>;
  /** Route delete through an existing mutation (e.g. one keyed by a related id, not the row's own id). */
  deleteDelegate?: (
    ctx: MutationCtx,
    token: string,
    userId: Id<"users">,
    id: string,
  ) => Promise<void>;
  /** If set, create/update surface the affected id as a chat card of this kind. */
  cardKind?: "memories" | "diaryEntries";
  /** Prose description of allowed fields, injected into the generated tool description. */
  fieldsDescription: string;
  /** Fields stripped from get/list results before they reach the model — embeddings, internal search fields, sync lock tokens. */
  omitFields?: string[];
  /** Per-field character caps for long text fields (e.g. content/rawText) — overrides the PRIMITIVE_FIELD_CHARS default for that field. Short/label fields (title, name, mood) should be omitted here so they're never truncated. */
  truncateFieldChars?: Record<string, number>;
};

async function ownedRow(
  ctx: MutationCtx,
  table: string,
  ownerField: string,
  userId: Id<"users">,
  id: string,
): Promise<Record<string, unknown> & { _id: string }> {
  const normalized = ctx.db.normalizeId(table as any, id);
  if (!normalized) throw new Error(`Not found in ${table}`);
  const row = await ctx.db.get(normalized as any);
  if (!row || (row as Record<string, unknown>)[ownerField] !== userId) {
    throw new Error(`Not found in ${table}`);
  }
  return row as Record<string, unknown> & { _id: string };
}

export const AI_TABLE_ALLOWLIST: Record<string, TablePrimitiveConfig> = {
  diaryEntries: {
    table: "diaryEntries",
    ownerField: "userId",
    allowedOps: new Set<AiOp>(["get", "list", "create", "update"]),
    listIndex: "by_user",
    omitFields: ["embedding", "embeddingFingerprint", "searchText"],
    truncateFieldChars: {
      rawText: DIARY_TOOL_EXCERPT_CHARS,
      correctedText: DIARY_TOOL_EXCERPT_CHARS,
    },
    cardKind: "diaryEntries",
    fieldsDescription:
      "create: rawText (string), correctedText (optional string), topics (optional string[]), mood (optional enum: happy/sad/anxious/excited/neutral/grateful/frustrated/hopeful/nostalgic/motivated), energyLevel (optional enum: high/medium/low). update: id + rawText (re-runs AI analysis).",
    createDelegate: async (ctx, token, _userId, fields) => {
      const entryId = await ctx.runMutation(api.diary.create, {
        token,
        rawText: typeof fields.rawText === "string" ? fields.rawText : undefined,
        correctedText: typeof fields.correctedText === "string" ? fields.correctedText : undefined,
        topics: Array.isArray(fields.topics) ? (fields.topics as string[]) : undefined,
        mood: typeof fields.mood === "string" ? (fields.mood as any) : undefined,
        energyLevel:
          typeof fields.energyLevel === "string" ? (fields.energyLevel as any) : undefined,
      });
      return { id: String(entryId) };
    },
    updateDelegate: async (ctx, token, _userId, id, fields) => {
      if (typeof fields.rawText !== "string" || !fields.rawText.trim()) {
        throw new Error("update_doc on diaryEntries requires a non-empty rawText field.");
      }
      await ctx.runMutation(api.diary.update, {
        token,
        id: id as Id<"diaryEntries">,
        rawText: fields.rawText,
      });
      return { id };
    },
  },

  reviewCards: {
    table: "reviewCards",
    ownerField: "userId",
    allowedOps: new Set<AiOp>(["list", "create", "delete"]),
    listIndex: "by_user",
    fieldsDescription:
      "create: memoryId (string, required). delete: id is the review card's own id.",
    createDelegate: async (ctx, token, _userId, fields) => {
      if (typeof fields.memoryId !== "string") {
        throw new Error("create_doc on reviewCards requires a memoryId field.");
      }
      const cardId = await ctx.runMutation(api.review.addToReview, {
        token,
        memoryId: fields.memoryId as Id<"memories">,
      });
      return { id: String(cardId) };
    },
    deleteDelegate: async (ctx, token, userId, id) => {
      const row = await ownedRow(ctx, "reviewCards", "userId", userId, id);
      await ctx.runMutation(api.review.removeFromReview, {
        token,
        memoryId: row.memoryId as Id<"memories">,
      });
    },
  },

  sharedMemories: {
    table: "sharedMemories",
    ownerField: "sharedByUserId",
    allowedOps: new Set<AiOp>(["get", "list", "create", "delete"]),
    listIndex: "by_user",
    fieldsDescription:
      "create: memoryId (string, required), expiresInDays (optional number). delete: id is the share record's own id.",
    createDelegate: async (ctx, token, _userId, fields) => {
      if (typeof fields.memoryId !== "string") {
        throw new Error("create_doc on sharedMemories requires a memoryId field.");
      }
      const shareToken = await ctx.runMutation(api.sharing.createShareLink, {
        token,
        memoryId: fields.memoryId as Id<"memories">,
        expiresInDays: typeof fields.expiresInDays === "number" ? fields.expiresInDays : undefined,
      });
      // createShareLink returns the token, not the sharedMemories row's own
      // id — look the row up so delete_doc(sharedMemories, id) later gets a
      // real row id to resolve ownership against, not an opaque token.
      const row = await ctx.db
        .query("sharedMemories")
        .withIndex("by_token", (q) => q.eq("shareToken", shareToken))
        .unique();
      return { id: row ? String(row._id) : String(shareToken) };
    },
    deleteDelegate: async (ctx, token, userId, id) => {
      const row = await ownedRow(ctx, "sharedMemories", "sharedByUserId", userId, id);
      await ctx.runMutation(api.sharing.revokeShareLink, {
        token,
        memoryId: row.memoryId as Id<"memories">,
      });
    },
  },

  userTopics: {
    table: "userTopics",
    ownerField: "userId",
    allowedOps: new Set<AiOp>(["get", "list", "update"]),
    listIndex: "by_user",
    omitFields: ["centroid", "embeddingFingerprint"],
    allowedUpdateKeys: ["name", "description", "icon", "color"],
    fieldsDescription:
      "update only: name, description, icon (Feather icon name), color (hex string). Cosmetic fields only — merging or re-clustering topics goes through manage_topics instead.",
  },

  memories: {
    table: "memories",
    ownerField: "userId",
    allowedOps: new Set<AiOp>(["get", "list", "update"]),
    listIndex: "by_user_status",
    indexedFilterFields: ["status"],
    defaultFilters: { status: "active" },
    statusField: "status",
    cardKind: "memories",
    truncateFieldChars: { content: MEMORY_COMPACT_CONTENT_CHARS },
    omitFields: [
      "embedding",
      "embeddingFingerprint",
      "searchText",
      "semanticSummary",
      "searchAliases",
      "searchConcepts",
      "attachmentExcerpt",
      "retrievalVersion",
      "retrievalState",
      "googleSyncLockToken",
      "googleSyncLockAt",
      "googleSyncFingerprint",
      "googleSyncDesiredFingerprint",
    ],
    fieldsDescription:
      'list filters: status (active/deleted/completed, default active). update: the ONLY allowed field is status set to "active" — used to restore a soft-deleted memory (equivalent to restore_memory). All other memory fields go through create_memory/update_memory instead.',
    updateDelegate: async (ctx, token, _userId, id, fields) => {
      if (fields.status !== "active") {
        throw new Error(
          'update_doc on memories only supports {status: "active"} (restoring a deleted memory). Use update_memory for other fields.',
        );
      }
      await ctx.runMutation(api.memories.restore, { token, id: id as Id<"memories"> });
      return { id };
    },
  },
};

export function getTableConfig(table: string): TablePrimitiveConfig | undefined {
  return AI_TABLE_ALLOWLIST[table];
}

export function requireTableConfig(table: string, op: AiOp): TablePrimitiveConfig {
  const config = AI_TABLE_ALLOWLIST[table];
  if (!config) {
    throw new Error(
      `Unknown table "${table}". Allowed tables: ${Object.keys(AI_TABLE_ALLOWLIST).join(", ")}.`,
    );
  }
  if (!config.allowedOps.has(op)) {
    throw new Error(`"${op}" is not allowed on table "${table}".`);
  }
  return config;
}

/** Never let a model-facing field whitelist include the owner field or other identity-bearing keys. */
const FORBIDDEN_KEYS = new Set(["userId", "sharedByUserId", "token", "_id", "_creationTime"]);

for (const config of Object.values(AI_TABLE_ALLOWLIST)) {
  for (const key of [...(config.allowedCreateKeys ?? []), ...(config.allowedUpdateKeys ?? [])]) {
    if (FORBIDDEN_KEYS.has(key)) {
      throw new Error(
        `AI_TABLE_ALLOWLIST["${config.table}"] whitelists forbidden key "${key}" — identity/owner fields must never be model-writable.`,
      );
    }
  }
}
