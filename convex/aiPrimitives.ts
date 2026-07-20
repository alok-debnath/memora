import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  createDocLogic,
  deleteDocLogic,
  getDocLogic,
  listDocsLogic,
  updateDocLogic,
} from "./lib/aiPrimitives/genericCrudLogic";

/**
 * Thin registrations for the 5 generic AI primitive tools (get/list/create/
 * update/delete_doc — see lib/chat/tools/genericPrimitives.ts). All handler
 * logic and the table allowlist live in lib/aiPrimitives/ — see
 * agent-context/ai-architecture.md's "Add an AI-exposed table" recipe.
 */

export const aiGetDoc = query({
  args: { token: v.string(), table: v.string(), id: v.string() },
  handler: getDocLogic,
});

export const aiListDocs = query({
  args: {
    token: v.string(),
    table: v.string(),
    filters: v.optional(v.record(v.string(), v.any())),
    limit: v.optional(v.number()),
  },
  handler: listDocsLogic,
});

export const aiCreateDoc = mutation({
  args: {
    token: v.string(),
    table: v.string(),
    fields: v.record(v.string(), v.any()),
  },
  handler: createDocLogic,
});

export const aiUpdateDoc = mutation({
  args: {
    token: v.string(),
    table: v.string(),
    id: v.string(),
    fields: v.record(v.string(), v.any()),
  },
  handler: updateDocLogic,
});

export const aiDeleteDoc = mutation({
  args: { token: v.string(), table: v.string(), id: v.string() },
  handler: deleteDocLogic,
});
