import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import type { ActionCtx } from "../../_generated/server";
import type { ChatMessageMeta } from "./types";
import { STREAM_PATCH_INTERVAL_MS } from "./budgets";

/**
 * Streams the assistant reply into a chatMessages doc while it generates.
 * The doc is created lazily on the first visible text (tool-only iterations
 * never create one), patched at most every STREAM_PATCH_INTERVAL_MS, and
 * finalized once with the clean text + structured meta. Patches are chained
 * so they always apply in order.
 *
 * Hidden HTML-comment markers the model may emit (MEMORA_USED_IDS fallback)
 * are held back: complete markers are stripped and a trailing partial
 * marker ("<!--MEMORA_US…") is withheld until it either completes or the
 * stream ends, so marker text never flashes in the UI.
 */
export function createReplyStreamer(ctx: ActionCtx, userId: Id<"users">) {
  let messageId: Id<"chatMessages"> | null = null;
  let buffer = "";
  let lastPatchAt = 0;
  let chain: Promise<void> = Promise.resolve();

  const visibleText = () =>
    buffer
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<!--[\s\S]*$/, "")
      .trimStart();

  const enqueue = (fn: () => Promise<void>) => {
    chain = chain.then(fn).catch(() => {
      // Streaming patches are best-effort; the finalize pass writes the
      // authoritative content either way.
    });
  };

  const flush = () => {
    lastPatchAt = Date.now();
    const text = visibleText();
    if (!text) {
      return;
    }
    enqueue(async () => {
      if (!messageId) {
        messageId = await ctx.runMutation(internal.chat.send, {
          userId,
          role: "assistant",
          content: text,
          streaming: true,
        });
      } else {
        await ctx.runMutation(internal.chat.patchMessageContent, {
          id: messageId,
          content: text,
        });
      }
    });
  };

  return {
    onDelta(delta: string) {
      buffer += delta;
      if (Date.now() - lastPatchAt >= STREAM_PATCH_INTERVAL_MS) {
        flush();
      }
    },
    /** Clear the buffer before a re-answer iteration (e.g. forced USED_IDS turn). */
    reset() {
      buffer = "";
    },
    /** Write the authoritative final content + meta; returns the message ID. */
    async finalize(args: { content: string; meta?: ChatMessageMeta }): Promise<Id<"chatMessages">> {
      await chain;
      if (messageId) {
        await ctx.runMutation(internal.chat.patchMessageContent, {
          id: messageId,
          content: args.content,
          ...(args.meta ? { meta: args.meta } : {}),
          streaming: false,
        });
        return messageId;
      }
      return await ctx.runMutation(internal.chat.send, {
        userId,
        role: "assistant",
        content: args.content,
        ...(args.meta ? { meta: args.meta } : {}),
      });
    },
  };
}

export type ReplyStreamer = ReturnType<typeof createReplyStreamer>;
