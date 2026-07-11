"use node";

import { v } from "convex/values";
import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { trackedTranscribeAudio } from "../lib/aiDispatch";

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

export const transcribe = action({
  args: { jobId: v.id("transcriptionJobs") },
  handler: async (
    ctx,
    args,
  ): Promise<
    { kind: "success"; text: string } | { kind: "error"; code: string; message: string }
  > => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity)
      return { kind: "error", code: "unauthenticated", message: "Sign in to transcribe audio." };
    const job = await ctx.runQuery(internal.transcriptionJobs.getForTranscription, {
      jobId: args.jobId,
      tokenIdentifier: identity.tokenIdentifier,
    });
    if (!job?.storageId)
      return {
        kind: "error",
        code: "invalid_job",
        message: "This recording is no longer available.",
      };
    if (
      !(await ctx.runMutation(internal.transcriptionJobs.markTranscribing, { jobId: args.jobId }))
    )
      return {
        kind: "error",
        code: "duplicate",
        message: "This recording is already being processed.",
      };
    try {
      const url = await ctx.storage.getUrl(job.storageId);
      if (!url) throw new Error("Audio upload is unavailable.");
      const response = await fetch(url);
      if (!response.ok) throw new Error("Audio download failed.");
      const audio = new Uint8Array(await response.arrayBuffer());
      if (!audio.byteLength || audio.byteLength > MAX_AUDIO_BYTES)
        throw new Error("Audio upload is invalid or too large.");
      const result = await trackedTranscribeAudio(ctx, {
        userId: job.userId,
        audio,
        format: job.mimeType.split("/")[1].replace("x-", ""),
        language: "en",
        durationMs: job.durationMs,
      });
      await ctx.runMutation(internal.transcriptionJobs.finish, {
        jobId: args.jobId,
        success: true,
      });
      return { kind: "success", text: result.text?.trim() ?? "" };
    } catch (error) {
      await ctx.runMutation(internal.transcriptionJobs.finish, {
        jobId: args.jobId,
        success: false,
        errorCode: "transcription_failed",
      });
      return {
        kind: "error",
        code: "transcription_failed",
        message:
          error instanceof Error && /not configured/i.test(error.message)
            ? "Transcription service is not configured."
            : "Could not transcribe this recording. Try again.",
      };
    }
  },
});
