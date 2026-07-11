import { v } from "convex/values";
import { internalMutation, internalQuery, mutation } from "./_generated/server";
import { resolveUser } from "./lib/withAuth";

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const MAX_DURATION_MS = 10 * 60 * 1000;
const JOB_TTL_MS = 20 * 60 * 1000;
const AUDIO_MIME_TYPES = new Set([
  "audio/m4a",
  "audio/mp4",
  "audio/x-m4a",
  "audio/webm",
  "audio/3gpp",
  "audio/mpeg",
  "audio/wav",
]);

function assertAudioMetadata(mimeType: string, durationMs: number) {
  if (!AUDIO_MIME_TYPES.has(mimeType)) throw new Error("Unsupported audio format.");
  if (!Number.isFinite(durationMs) || durationMs <= 0 || durationMs > MAX_DURATION_MS)
    throw new Error("Recordings must be between 1 second and 10 minutes.");
}

export const createUpload = mutation({
  args: { mimeType: v.string(), durationMs: v.number() },
  handler: async (ctx, args) => {
    const user = await resolveUser(ctx);
    assertAudioMetadata(args.mimeType, args.durationMs);
    const jobId = await ctx.db.insert("transcriptionJobs", {
      userId: user._id,
      status: "uploading",
      mimeType: args.mimeType,
      durationMs: args.durationMs,
      expiresAt: Date.now() + JOB_TTL_MS,
    });
    return { jobId, uploadUrl: await ctx.storage.generateUploadUrl() };
  },
});

export const attachUpload = mutation({
  args: { jobId: v.id("transcriptionJobs"), storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const user = await resolveUser(ctx);
    const job = await ctx.db.get(args.jobId);
    if (!job || job.userId !== user._id || job.status !== "uploading" || job.expiresAt < Date.now())
      throw new Error("This upload has expired.");
    const file = await ctx.db.system.get(args.storageId);
    if (
      !file ||
      file.size > MAX_AUDIO_BYTES ||
      !AUDIO_MIME_TYPES.has(file.contentType ?? "") ||
      file.contentType !== job.mimeType
    ) {
      await ctx.storage.delete(args.storageId);
      throw new Error("Audio upload is invalid or too large.");
    }
    await ctx.db.patch(args.jobId, { storageId: args.storageId, status: "uploaded" });
  },
});

export const getForTranscription = internalQuery({
  args: { jobId: v.id("transcriptionJobs"), tokenIdentifier: v.string() },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || !job.storageId || job.status !== "uploaded" || job.expiresAt < Date.now())
      return null;
    const user = await ctx.db.get(job.userId);
    return user?.tokenIdentifier === args.tokenIdentifier ? job : null;
  },
});

export const markTranscribing = internalMutation({
  args: { jobId: v.id("transcriptionJobs") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.status !== "uploaded") return false;
    await ctx.db.patch(args.jobId, { status: "transcribing" });
    return true;
  },
});

export const finish = internalMutation({
  args: {
    jobId: v.id("transcriptionJobs"),
    success: v.boolean(),
    errorCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) return;
    if (job.storageId) await ctx.storage.delete(job.storageId);
    await ctx.db.patch(args.jobId, {
      status: args.success ? "completed" : "failed",
      ...(args.errorCode ? { errorCode: args.errorCode } : {}),
    });
  },
});

export const cleanupExpired = internalMutation({
  args: {},
  handler: async (ctx) => {
    for (const status of ["uploading", "uploaded", "transcribing"] as const) {
      const jobs = await ctx.db
        .query("transcriptionJobs")
        .withIndex("by_status_and_expires_at", (q) =>
          q.eq("status", status).lt("expiresAt", Date.now()),
        )
        .take(100);
      for (const job of jobs) {
        if (job.storageId) await ctx.storage.delete(job.storageId);
        await ctx.db.patch(job._id, { status: "cancelled" });
      }
    }
  },
});
