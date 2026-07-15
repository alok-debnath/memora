import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { requireAdmin } from "./lib/withAuth";

/** Docs stuck in embeddingState "missing" longer than this are alert-worthy — write-time embed + two 6h backfill retries have all failed by then. */
const EMBEDDING_STUCK_AGE_MS = 24 * 60 * 60 * 1000;
/** Bounded scan cap per table; counts report ">= cap" via the truncated flag in the message. */
const EMBEDDING_SCAN_CAP = 500;

async function upsertAlert(
  ctx: MutationCtx,
  args: {
    key: string;
    active: boolean;
    severity: "info" | "warning" | "critical";
    title: string;
    message: string;
    count?: number;
  },
) {
  const existing = await ctx.db
    .query("systemAlerts")
    .withIndex("by_key", (q) => q.eq("key", args.key))
    .unique();
  const now = Date.now();
  if (args.active) {
    if (existing) {
      await ctx.db.patch(existing._id, {
        severity: args.severity,
        title: args.title,
        message: args.message,
        count: args.count,
        updatedAt: now,
        resolvedAt: undefined,
      });
    } else {
      await ctx.db.insert("systemAlerts", {
        key: args.key,
        severity: args.severity,
        title: args.title,
        message: args.message,
        count: args.count,
        updatedAt: now,
      });
    }
  } else if (existing && !existing.resolvedAt) {
    await ctx.db.patch(existing._id, { resolvedAt: now, updatedAt: now });
  }
}

/**
 * Cron: flag memories/diary entries stuck without embeddings (vector-search
 * invisible). A transient embed failure recovers via the 6h backfills; a doc
 * still "missing" after 24h means every retry failed (hard dimension
 * mismatch, dead route) and needs an admin.
 */
export const checkEmbeddingHealth = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const cutoff = Date.now() - EMBEDDING_STUCK_AGE_MS;

    const stuckMemories = (
      await ctx.db
        .query("memories")
        .withIndex("by_status_embeddingState", (q) =>
          q.eq("status", "active").eq("embeddingState", "missing"),
        )
        .take(EMBEDDING_SCAN_CAP)
    ).filter((memory) => memory._creationTime < cutoff);

    const stuckDiary = (
      await ctx.db
        .query("diaryEntries")
        .withIndex("by_embeddingState", (q) => q.eq("embeddingState", "missing"))
        .take(EMBEDDING_SCAN_CAP)
    ).filter((entry) => entry._creationTime < cutoff);

    const total = stuckMemories.length + stuckDiary.length;
    const truncated =
      stuckMemories.length >= EMBEDDING_SCAN_CAP || stuckDiary.length >= EMBEDDING_SCAN_CAP;

    await upsertAlert(ctx, {
      key: "embeddings_stuck",
      active: total > 0,
      severity: total > 25 ? "critical" : "warning",
      title: "Embeddings stuck past retry window",
      message: `${total}${truncated ? "+" : ""} document${total === 1 ? "" : "s"} (${stuckMemories.length} memories, ${stuckDiary.length} diary) still lack embeddings after 24h of backfill retries — likely a hard embedding-route failure.`,
      count: total,
    });
    return null;
  },
});

/** Active + recently resolved operational alerts for the admin System screen. */
export const listForAdmin = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rows = await ctx.db.query("systemAlerts").take(100);
    return rows.sort((a, b) => b.updatedAt - a.updatedAt);
  },
});
