"use node";

import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { getEmbeddingFingerprintForUser, trackedEmbedText } from "../lib/aiDispatch";
import { ATTACHMENT_EXCERPT_CHARS } from "../lib/chat/budgets";
import { buildMemoryEmbeddingText, buildMemorySearchText } from "../lib/memoryRetrieval";

/**
 * Folds a memory's linked attachments' extracted text (OCR/PDF, see
 * memoryAttachments.extractedContent) into the memory's embedding text and
 * a denormalized `attachmentExcerpt` field, so search_memories can retrieve
 * it later. Previously attachment text was only visible to the model on
 * the turn it was uploaded — memoryAttachments.extractedContent had no
 * search index and was never folded into the parent memory.
 *
 * Write-time only (one embed per attachment upload, triggered right after
 * extraction/linking completes) — adds no per-chat-turn AI cost. See
 * buildMemoryEmbeddingText in lib/memoryRetrieval.ts for why
 * attachmentExcerpt must also be threaded through every future re-embed of
 * this memory, not just this one.
 */
export const foldAttachmentIntoMemory = internalAction({
  args: { memoryId: v.id("memories") },
  handler: async (ctx, args) => {
    const memory = await ctx.runQuery(internal.memories.getInternal, {
      memoryId: args.memoryId,
    });
    if (!memory) return;

    const attachments = await ctx.runQuery(
      internal.attachments.listExtractedContentForMemoryInternal,
      { memoryId: args.memoryId },
    );
    if (attachments.length === 0) return;

    const attachmentExcerpt = attachments
      .map((a) => `${a.filename}: ${a.extractedContent}`)
      .join("\n\n")
      .slice(0, ATTACHMENT_EXCERPT_CHARS);
    if (!attachmentExcerpt) return;

    try {
      const embedding = await trackedEmbedText(ctx, {
        userId: memory.userId,
        feature: "memory_processing",
        stage: "attachment_fold_embedding",
        visibility: "background",
        input: buildMemoryEmbeddingText({
          title: memory.title,
          content: memory.content,
          people: memory.people,
          locations: memory.locations,
          lifeArea: memory.lifeArea,
          entryKind: memory.entryKind,
          attachmentExcerpt,
          semanticSummary: memory.semanticSummary,
          searchAliases: memory.searchAliases,
          searchConcepts: memory.searchConcepts,
        }),
      });
      const embeddingFingerprint = await getEmbeddingFingerprintForUser(ctx, memory.userId);
      await ctx.runMutation(internal.processMemoryMutations.updateAIFields, {
        memoryId: args.memoryId,
        embedding,
        embeddingFingerprint,
        searchText: buildMemorySearchText({ ...memory, attachmentExcerpt }),
      });
      await ctx.runMutation(internal.memories.patchAttachmentExcerptInternal, {
        memoryId: args.memoryId,
        attachmentExcerpt,
      });
    } catch {
      // Best effort — attachment-text search is a nice-to-have, not a
      // write-path guarantee. The embedding backfill cron doesn't retry
      // this specific step, but the memory remains searchable by its own
      // content either way.
    }
  },
});
