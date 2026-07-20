import type { Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { LIST_LIMIT_DEFAULT, LIST_LIMIT_MAX, PRIMITIVE_FIELD_CHARS } from "../chat/budgets";
import { resolveUser } from "../withAuth";
import { requireTableConfig, type TablePrimitiveConfig } from "./tableRegistry";

function pickAllowedKeys(
  fields: Record<string, unknown>,
  allowedKeys: string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of allowedKeys) {
    if (key in fields) out[key] = fields[key];
  }
  return out;
}

/** Strips embeddings/internal-search/lock fields before a row reaches the model — see TablePrimitiveConfig.omitFields. */
function omitFields<T extends Record<string, unknown>>(row: T, fields?: string[]): T {
  if (!fields || fields.length === 0) return row;
  const out = { ...row };
  for (const field of fields) delete out[field];
  return out;
}

/**
 * Short label/identifier fields shared across tables — never truncate these
 * even if a future table happens to store a long value in one, since cutting
 * a title/name/status mid-string corrupts the record rather than just
 * shortening it.
 */
const NEVER_TRUNCATE_FIELDS = new Set([
  "title",
  "name",
  "slug",
  "status",
  "mood",
  "energyLevel",
  "icon",
  "color",
  "entryKind",
  "importance",
  "lifeArea",
]);

/**
 * Caps long text fields so a single row can't blow up tool-result token
 * cost. Uses the table's per-field caps (config.truncateFieldChars — e.g.
 * content/rawText) where set; other fields fall back to the generic
 * PRIMITIVE_FIELD_CHARS safety net, except NEVER_TRUNCATE_FIELDS which are
 * always left intact.
 */
function truncateStrings<T extends Record<string, unknown>>(
  row: T,
  truncateFieldChars?: Record<string, number>,
): T {
  const out = { ...row };
  for (const [key, value] of Object.entries(out)) {
    if (typeof value !== "string" || NEVER_TRUNCATE_FIELDS.has(key)) continue;
    const cap = truncateFieldChars?.[key] ?? PRIMITIVE_FIELD_CHARS;
    if (value.length > cap) {
      (out as Record<string, unknown>)[key] = `${value.slice(0, cap)}…`;
    }
  }
  return out;
}

function projectRow<T extends Record<string, unknown>>(row: T, config: TablePrimitiveConfig): T {
  return truncateStrings(omitFields(row, config.omitFields), config.truncateFieldChars);
}

export async function getDocLogic(
  ctx: QueryCtx,
  args: { token: string; table: string; id: string },
) {
  const { userId } = await resolveUser(ctx, args.token);
  const config = requireTableConfig(args.table, "get");
  const normalized = ctx.db.normalizeId(args.table as any, args.id);
  if (!normalized) return null;
  const row = await ctx.db.get(normalized as any);
  if (!row || (row as Record<string, unknown>)[config.ownerField] !== userId) return null;
  return projectRow(row as Record<string, unknown>, config);
}

export async function listDocsLogic(
  ctx: QueryCtx,
  args: {
    token: string;
    table: string;
    filters?: Record<string, unknown>;
    limit?: number;
  },
) {
  const { userId } = await resolveUser(ctx, args.token);
  const config = requireTableConfig(args.table, "list");
  const limit = args.limit ? Math.min(Math.max(args.limit, 1), LIST_LIMIT_MAX) : LIST_LIMIT_DEFAULT;
  const effectiveFilters = { ...(config.defaultFilters ?? {}), ...(args.filters ?? {}) };
  const indexedFields = config.indexedFilterFields ?? [];

  const rows = await ctx.db
    .query(args.table as any)
    .withIndex(config.listIndex as any, (q: any) => {
      let query = q.eq(config.ownerField, userId);
      for (const field of indexedFields) {
        if (effectiveFilters[field] !== undefined) {
          query = query.eq(field, effectiveFilters[field]);
        }
      }
      return query;
    })
    .order("desc")
    .take(Math.min(limit * 2, 60));

  const remainingFilterKeys = Object.keys(effectiveFilters).filter(
    (key) => !indexedFields.includes(key),
  );
  const filtered =
    remainingFilterKeys.length === 0
      ? rows
      : rows.filter((row: any) =>
          remainingFilterKeys.every((key) => row[key] === effectiveFilters[key]),
        );

  return filtered.slice(0, limit).map((row: Record<string, unknown>) => projectRow(row, config));
}

export async function createDocLogic(
  ctx: MutationCtx,
  args: { token: string; table: string; fields: Record<string, unknown> },
) {
  const { userId } = await resolveUser(ctx, args.token);
  const config = requireTableConfig(args.table, "create");
  if (config.createDelegate) {
    return await config.createDelegate(ctx, args.token, userId, args.fields ?? {});
  }
  if (!config.allowedCreateKeys) {
    throw new Error(`Table "${args.table}" has no raw create path configured.`);
  }
  const picked = pickAllowedKeys(args.fields ?? {}, config.allowedCreateKeys);
  const id = await ctx.db.insert(
    args.table as any,
    {
      ...picked,
      [config.ownerField]: userId,
    } as any,
  );
  return { id: String(id) };
}

export async function updateDocLogic(
  ctx: MutationCtx,
  args: { token: string; table: string; id: string; fields: Record<string, unknown> },
) {
  const { userId } = await resolveUser(ctx, args.token);
  const config = requireTableConfig(args.table, "update");
  if (config.updateDelegate) {
    return await config.updateDelegate(ctx, args.token, userId, args.id, args.fields ?? {});
  }
  if (!config.allowedUpdateKeys) {
    throw new Error(`Table "${args.table}" has no raw update path configured.`);
  }
  const normalized = ctx.db.normalizeId(args.table as any, args.id);
  if (!normalized) throw new Error(`Not found in ${args.table}`);
  const row = await ctx.db.get(normalized as any);
  if (!row || (row as Record<string, unknown>)[config.ownerField] !== userId) {
    throw new Error(`Not found in ${args.table}`);
  }
  const picked = pickAllowedKeys(args.fields ?? {}, config.allowedUpdateKeys);
  if (Object.keys(picked).length === 0) {
    return { id: args.id };
  }
  await ctx.db.patch(normalized as any, picked as any);
  return { id: args.id };
}

export async function deleteDocLogic(
  ctx: MutationCtx,
  args: { token: string; table: string; id: string },
) {
  const { userId } = await resolveUser(ctx, args.token);
  const config = requireTableConfig(args.table, "delete");
  if (config.deleteDelegate) {
    await config.deleteDelegate(ctx, args.token, userId, args.id);
    return { success: true };
  }
  const normalized = ctx.db.normalizeId(args.table as any, args.id);
  if (!normalized) throw new Error(`Not found in ${args.table}`);
  const row = await ctx.db.get(normalized as any);
  if (!row || (row as Record<string, unknown>)[config.ownerField] !== userId) {
    throw new Error(`Not found in ${args.table}`);
  }
  if (config.deleteMode === "soft") {
    if (!config.statusField || !config.deletedStatusValue) {
      throw new Error(`Table "${args.table}" is missing soft-delete configuration.`);
    }
    await ctx.db.patch(
      normalized as any,
      { [config.statusField]: config.deletedStatusValue } as any,
    );
  } else {
    await ctx.db.delete(normalized as any);
  }
  return { success: true };
}

export type { TablePrimitiveConfig };
