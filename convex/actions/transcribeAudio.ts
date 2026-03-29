"use node";

import { v } from "convex/values";
import { action } from "../_generated/server";
import { api } from "../_generated/api";
import { hasOpenAI, transcribeBase64Audio } from "../lib/openai";

export const transcribe = action({
  args: {
    token: v.string(),
    audioBase64: v.string(),
    format: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.runQuery(api.auth.me, { token: args.token });
    if (!user) {
      return { text: "Authentication required." };
    }

    const maxSizeBytes = 10 * 1024 * 1024;
    if (args.audioBase64.length > maxSizeBytes * 1.37) {
      return { text: "Audio file too large. Maximum 10MB." };
    }
    if (!hasOpenAI()) {
      return { text: "Transcription service is not configured." };
    }

    try {
      const response = await transcribeBase64Audio({
        audioBase64: args.audioBase64,
        format: args.format,
      });
      return { text: response.text || "" };
    } catch {
      return { text: "Transcription failed. Please try again." };
    }
  },
});
