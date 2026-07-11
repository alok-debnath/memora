import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

export const start = internalMutation({
  args: { targetVersion: v.number() },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("retrievalRebuildJobs", {
      status: "running",
      targetVersion: args.targetVersion,
      inspected: 0,
      rebuilt: 0,
      failures: 0,
      startedAt: now,
      updatedAt: now,
    });
  },
});

export const recordBatch = internalMutation({
  args: {
    jobId: v.id("retrievalRebuildJobs"),
    cursor: v.optional(v.string()),
    inspected: v.number(),
    rebuilt: v.number(),
    failures: v.number(),
    lastError: v.optional(v.string()),
    completed: v.boolean(),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.status !== "running") return;
    const now = Date.now();
    await ctx.db.patch(args.jobId, {
      cursor: args.cursor,
      inspected: job.inspected + args.inspected,
      rebuilt: job.rebuilt + args.rebuilt,
      failures: job.failures + args.failures,
      ...(args.lastError ? { lastError: args.lastError.slice(0, 500) } : {}),
      status: args.completed ? "completed" : "running",
      updatedAt: now,
      ...(args.completed ? { completedAt: now } : {}),
    });
  },
});

export const fail = internalMutation({
  args: { jobId: v.id("retrievalRebuildJobs"), error: v.string() },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.status !== "running") return;
    await ctx.db.patch(args.jobId, {
      status: "failed",
      failures: job.failures + 1,
      lastError: args.error.slice(0, 500),
      updatedAt: Date.now(),
    });
  },
});

export const latest = internalQuery({
  args: {},
  handler: async (ctx) =>
    await ctx.db.query("retrievalRebuildJobs").withIndex("by_startedAt").order("desc").first(),
});
