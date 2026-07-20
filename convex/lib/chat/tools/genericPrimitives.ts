"use node";

import { api } from "../../../_generated/api";
import { AI_TABLE_ALLOWLIST } from "../../aiPrimitives/tableRegistry";
import { invalidatePrimitiveReadCache } from "../turnState";
import type { ChatTool } from "./toolTypes";

type PrimitiveOp = "get" | "list" | "create" | "update" | "delete";

function tableNamesForOp(op: PrimitiveOp): string[] {
  return Object.values(AI_TABLE_ALLOWLIST)
    .filter((config) => config.allowedOps.has(op))
    .map((config) => config.table);
}

function tablesDescription(op: PrimitiveOp): string {
  const lines = Object.values(AI_TABLE_ALLOWLIST)
    .filter((config) => config.allowedOps.has(op))
    .map((config) => `${config.table}: ${config.fieldsDescription}`);
  return lines.join(" | ");
}

/**
 * The 5 generic primitive tools. Each operates on any table in
 * AI_TABLE_ALLOWLIST (lib/aiPrimitives/tableRegistry.ts) — that allowlist,
 * not this file, is the real security boundary. Use these for anything not
 * covered by a dedicated tool (create_memory/update_memory, search_memories,
 * combine_memories, propose_deletion, sync_reminder/remove_reminder_sync,
 * manage_topics, history, get_stats) — e.g. diary entries, review cards,
 * sharing, topic renames, or restoring a deleted memory.
 */
export const getDocTool: ChatTool = {
  name: "get_doc",
  label: "Get record",
  kind: "read",
  definition: {
    type: "function",
    function: {
      name: "get_doc",
      description: `Fetch one record by id from an allowed table. Tables: ${tablesDescription("get")}`,
      parameters: {
        type: "object",
        properties: {
          table: { type: "string", enum: tableNamesForOp("get") },
          id: { type: "string" },
        },
        required: ["table", "id"],
        additionalProperties: false,
      },
    },
  },
  buildStatus: (fnArgs) => ({
    phase: "loading",
    detail: `Reading a record from ${String(fnArgs.table ?? "backend")}`,
    source: "backend",
    events: [{ label: "Table", value: String(fnArgs.table ?? "") }],
  }),
  handler: async (tc, fnArgs) => {
    try {
      const table = String(fnArgs.table ?? "");
      const id = String(fnArgs.id ?? "");
      const cacheKey = `${table}:get:${id}`;
      const cached = tc.state.primitiveReadCache.get(cacheKey);
      if (cached !== undefined) return cached;
      const doc = await tc.ctx.runQuery(api.aiPrimitives.aiGetDoc, {
        token: tc.token,
        table,
        id,
      });
      const result = JSON.stringify({ doc });
      tc.state.primitiveReadCache.set(cacheKey, result);
      return result;
    } catch (error) {
      return JSON.stringify({ error: error instanceof Error ? error.message : "get_doc failed" });
    }
  },
};

export const listDocsTool: ChatTool = {
  name: "list_docs",
  label: "List records",
  kind: "read",
  definition: {
    type: "function",
    function: {
      name: "list_docs",
      description: `List the user's own records from an allowed table, optionally filtered. Tables: ${tablesDescription("list")}`,
      parameters: {
        type: "object",
        properties: {
          table: { type: "string", enum: tableNamesForOp("list") },
          filters: {
            type: "object",
            description: 'Optional equality filters, e.g. {"status": "deleted"}.',
          },
          limit: { type: "number" },
        },
        required: ["table"],
        additionalProperties: false,
      },
    },
  },
  buildStatus: (fnArgs) => ({
    phase: "loading",
    detail: `Listing records from ${String(fnArgs.table ?? "backend")}`,
    source: "backend",
    events: [{ label: "Table", value: String(fnArgs.table ?? "") }],
  }),
  handler: async (tc, fnArgs) => {
    try {
      const table = String(fnArgs.table ?? "");
      const filters =
        fnArgs.filters && typeof fnArgs.filters === "object"
          ? (fnArgs.filters as Record<string, unknown>)
          : undefined;
      const limit = typeof fnArgs.limit === "number" ? fnArgs.limit : undefined;
      const cacheKey = `${table}:list:${JSON.stringify(filters ?? {})}:${limit ?? ""}`;
      const cached = tc.state.primitiveReadCache.get(cacheKey);
      if (cached !== undefined) {
        const parsed = JSON.parse(cached) as { count: number };
        await tc.reportProgress({
          phase: "loading",
          detail: `Loaded ${parsed.count} record(s) (cached)`,
          source: "backend",
          resultCount: parsed.count,
          events: [{ label: "Table", value: table }],
        });
        return cached;
      }
      const docs = await tc.ctx.runQuery(api.aiPrimitives.aiListDocs, {
        token: tc.token,
        table,
        filters,
        limit,
      });
      await tc.reportProgress({
        phase: "loading",
        detail: `Loaded ${Array.isArray(docs) ? docs.length : 0} record(s)`,
        source: "backend",
        resultCount: Array.isArray(docs) ? docs.length : undefined,
        events: [{ label: "Table", value: table }],
      });
      const result = JSON.stringify({ docs, count: Array.isArray(docs) ? docs.length : 0 });
      tc.state.primitiveReadCache.set(cacheKey, result);
      return result;
    } catch (error) {
      return JSON.stringify({ error: error instanceof Error ? error.message : "list_docs failed" });
    }
  },
};

export const createDocTool: ChatTool = {
  name: "create_doc",
  label: "Create record",
  definition: {
    type: "function",
    function: {
      name: "create_doc",
      description: `Create a new record in an allowed table. Only the fields listed below are accepted — anything else is silently dropped. Tables: ${tablesDescription("create")}`,
      parameters: {
        type: "object",
        properties: {
          table: { type: "string", enum: tableNamesForOp("create") },
          fields: { type: "object" },
        },
        required: ["table", "fields"],
        additionalProperties: false,
      },
    },
  },
  buildStatus: (fnArgs) => ({
    phase: "writing",
    detail: `Creating a record in ${String(fnArgs.table ?? "backend")}`,
    source: "backend",
    events: [{ label: "Table", value: String(fnArgs.table ?? "") }],
  }),
  handler: async (tc, fnArgs) => {
    try {
      const table = String(fnArgs.table ?? "");
      const result = await tc.ctx.runMutation(api.aiPrimitives.aiCreateDoc, {
        token: tc.token,
        table,
        fields:
          fnArgs.fields && typeof fnArgs.fields === "object"
            ? (fnArgs.fields as Record<string, unknown>)
            : {},
      });
      tc.invalidateRecentMemories();
      invalidatePrimitiveReadCache(tc.state, table);
      tc.state.writeToolCalled = true;
      if (AI_TABLE_ALLOWLIST[table]?.cardKind) {
        tc.state.pendingCardIds.add(String(result.id));
      }
      await tc.reportProgress({
        phase: "writing",
        detail: `Created a record in ${table}`,
        source: "backend",
        events: [
          { label: "Table", value: table },
          { label: "ID", value: String(result.id) },
        ],
      });
      return JSON.stringify({ success: true, id: result.id, table });
    } catch (error) {
      return JSON.stringify({
        error: error instanceof Error ? error.message : "create_doc failed",
      });
    }
  },
};

export const updateDocTool: ChatTool = {
  name: "update_doc",
  label: "Update record",
  definition: {
    type: "function",
    function: {
      name: "update_doc",
      description: `Update fields on an existing record in an allowed table. Only the fields listed below are accepted. Tables: ${tablesDescription("update")}`,
      parameters: {
        type: "object",
        properties: {
          table: { type: "string", enum: tableNamesForOp("update") },
          id: { type: "string" },
          fields: { type: "object" },
        },
        required: ["table", "id", "fields"],
        additionalProperties: false,
      },
    },
  },
  buildStatus: (fnArgs) => ({
    phase: "writing",
    detail: `Updating a record in ${String(fnArgs.table ?? "backend")}`,
    source: "backend",
    events: [{ label: "Table", value: String(fnArgs.table ?? "") }],
  }),
  handler: async (tc, fnArgs) => {
    try {
      const table = String(fnArgs.table ?? "");
      const id = String(fnArgs.id ?? "");
      const result = await tc.ctx.runMutation(api.aiPrimitives.aiUpdateDoc, {
        token: tc.token,
        table,
        id,
        fields:
          fnArgs.fields && typeof fnArgs.fields === "object"
            ? (fnArgs.fields as Record<string, unknown>)
            : {},
      });
      tc.invalidateRecentMemories();
      invalidatePrimitiveReadCache(tc.state, table);
      tc.state.writeToolCalled = true;
      if (AI_TABLE_ALLOWLIST[table]?.cardKind) {
        tc.state.pendingCardIds.add(String(result.id));
      }
      await tc.reportProgress({
        phase: "writing",
        detail: `Updated a record in ${table}`,
        source: "backend",
        events: [
          { label: "Table", value: table },
          { label: "ID", value: String(result.id) },
        ],
      });
      return JSON.stringify({ success: true, id: result.id, table });
    } catch (error) {
      return JSON.stringify({
        error: error instanceof Error ? error.message : "update_doc failed",
      });
    }
  },
};

export const deleteDocTool: ChatTool = {
  name: "delete_doc",
  label: "Delete record",
  definition: {
    type: "function",
    function: {
      name: "delete_doc",
      description: `Delete (or unshare/un-review) a record in an allowed table. Tables: ${tablesDescription("delete")}. To delete a memory itself, use propose_deletion instead — this never removes memories.`,
      parameters: {
        type: "object",
        properties: {
          table: { type: "string", enum: tableNamesForOp("delete") },
          id: { type: "string" },
        },
        required: ["table", "id"],
        additionalProperties: false,
      },
    },
  },
  buildStatus: (fnArgs) => ({
    phase: "writing",
    detail: `Deleting a record in ${String(fnArgs.table ?? "backend")}`,
    source: "backend",
    events: [{ label: "Table", value: String(fnArgs.table ?? "") }],
  }),
  handler: async (tc, fnArgs) => {
    try {
      const table = String(fnArgs.table ?? "");
      if (table === "memories") {
        return JSON.stringify({
          error: "delete_doc cannot remove memories — use propose_deletion instead.",
        });
      }
      await tc.ctx.runMutation(api.aiPrimitives.aiDeleteDoc, {
        token: tc.token,
        table,
        id: String(fnArgs.id ?? ""),
      });
      invalidatePrimitiveReadCache(tc.state, table);
      tc.state.writeToolCalled = true;
      await tc.reportProgress({
        phase: "writing",
        detail: `Deleted a record in ${table}`,
        source: "backend",
        events: [{ label: "Table", value: table }],
      });
      return JSON.stringify({ success: true, table });
    } catch (error) {
      return JSON.stringify({
        error: error instanceof Error ? error.message : "delete_doc failed",
      });
    }
  },
};

export const GENERIC_PRIMITIVE_TOOLS: ChatTool[] = [
  getDocTool,
  listDocsTool,
  createDocTool,
  updateDocTool,
  deleteDocTool,
];
