import { v } from "convex/values";
import { mutation, query, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { resolveUser } from "./lib/withAuth";
import { paginationOptsValidator } from "convex/server";

// ─── Queries ────────────────────────────────────────────────────────────────

export const getAttachmentsForMemory = query({
  args: {
    token: v.optional(v.string()),
    memoryId: v.id("memories"),
  },
  handler: async (ctx, args) => {
    const user = await resolveUser(ctx, args.token);
    return ctx.db
      .query("memoryAttachments")
      .withIndex("by_memory", (q) => q.eq("memoryId", args.memoryId))
      .filter((q) => q.eq(q.field("userId"), user._id))
      .take(50);
  },
});

/**
 * Returns attachment counts keyed by memory ID.
 * Use this to efficiently check if multiple memories have Drive files.
 */
export const getAttachmentCountsForMemories = query({
  args: {
    token: v.string(),
    memoryIds: v.array(v.id("memories")),
  },
  handler: async (ctx, args) => {
    if (args.memoryIds.length === 0) return {} as Record<string, number>;
    const user = await resolveUser(ctx, args.token);
    const counts: Record<string, number> = {};
    await Promise.all(
      args.memoryIds.map(async (memoryId) => {
        const rows = await ctx.db
          .query("memoryAttachments")
          .withIndex("by_memory", (q) => q.eq("memoryId", memoryId))
          .filter((q) => q.eq(q.field("userId"), user._id))
          .take(1);
        if (rows.length > 0) counts[memoryId] = rows.length;
      }),
    );
    return counts as Record<string, number>;
  },
});

export const getAttachmentsForMessage = query({
  args: {
    token: v.optional(v.string()),
    chatMessageId: v.id("chatMessages"),
  },
  handler: async (ctx, args) => {
    const user = await resolveUser(ctx, args.token);
    return ctx.db
      .query("memoryAttachments")
      .withIndex("by_chat_message", (q) => q.eq("chatMessageId", args.chatMessageId))
      .filter((q) => q.eq(q.field("userId"), user._id))
      .take(20);
  },
});

export const listAttachmentsForUser = query({
  args: {
    token: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
    type: v.optional(v.union(v.literal("image"), v.literal("document"))),
  },
  handler: async (ctx, args) => {
    const user = await resolveUser(ctx, args.token);
    const base = ctx.db
      .query("memoryAttachments")
      .withIndex("by_user_and_createdAt", (q) => q.eq("userId", user._id))
      .order("desc");

    const active = base.filter((q) => q.neq(q.field("isDeleted"), true));
    if (args.type) {
      return active.filter((q) => q.eq(q.field("type"), args.type!)).paginate(args.paginationOpts);
    }
    return active.paginate(args.paginationOpts);
  },
});

export const getAttachment = query({
  args: {
    token: v.optional(v.string()),
    attachmentId: v.id("memoryAttachments"),
  },
  handler: async (ctx, args) => {
    const user = await resolveUser(ctx, args.token);
    const attachment = await ctx.db.get(args.attachmentId);
    if (!attachment || attachment.userId !== user._id) return null;
    return attachment;
  },
});

// ─── Internal queries ────────────────────────────────────────────────────────

export const getAttachmentInternal = internalQuery({
  args: { attachmentId: v.id("memoryAttachments") },
  handler: async (ctx, args) => {
    return ctx.db.get(args.attachmentId);
  },
});

export const getAttachmentsForMessageInternal = internalQuery({
  args: { chatMessageId: v.id("chatMessages") },
  handler: async (ctx, args) => {
    return ctx.db
      .query("memoryAttachments")
      .withIndex("by_chat_message", (q) => q.eq("chatMessageId", args.chatMessageId))
      .take(20);
  },
});

// ─── Mutations ───────────────────────────────────────────────────────────────

const driveAttachmentInput = v.object({
  filename: v.string(),
  mimeType: v.string(),
  sizeBytes: v.number(),
  type: v.union(v.literal("image"), v.literal("document")),
  driveFileId: v.string(),
  driveFolderId: v.string(),
  driveWebViewLink: v.optional(v.string()),
  driveThumbnailLink: v.optional(v.string()),
});

/**
 * Called by the client after successfully uploading files to Drive.
 * Creates attachment records and links them to a chat message.
 * Schedules background content extraction for each file.
 */
export const recordAttachmentsForMessage = mutation({
  args: {
    token: v.optional(v.string()),
    chatMessageId: v.id("chatMessages"),
    files: v.array(driveAttachmentInput),
  },
  handler: async (ctx, args) => {
    const user = await resolveUser(ctx, args.token);
    const now = Date.now();

    const attachmentIds: Array<{
      attachmentId: Id<"memoryAttachments">;
      name: string;
      type: "image" | "document";
      mimeType: string;
    }> = [];

    for (const file of args.files) {
      const attachmentId = await ctx.db.insert("memoryAttachments", {
        userId: user._id,
        chatMessageId: args.chatMessageId,
        type: file.type,
        filename: file.filename,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        driveFileId: file.driveFileId,
        driveFolderId: file.driveFolderId,
        driveWebViewLink: file.driveWebViewLink,
        driveThumbnailLink: file.driveThumbnailLink,
        processingStatus: "pending",
        createdAt: now,
      });

      attachmentIds.push({
        attachmentId,
        name: file.filename,
        type: file.type,
        mimeType: file.mimeType,
      });

      await ctx.runMutation(internal.analytics.recordProductEvent, {
        userId: user._id,
        event: "attachment_uploaded",
        bytes: file.sizeBytes,
      });
      await ctx.runMutation(internal.analytics.recordStorageDelta, {
        userId: user._id,
        bytesDelta: file.sizeBytes,
        fileCountDelta: 1,
        imageCountDelta: file.type === "image" ? 1 : 0,
        documentCountDelta: file.type === "document" ? 1 : 0,
      });

      await ctx.scheduler.runAfter(0, internal.actions.processAttachment.processAttachment, {
        attachmentId,
        userId: user._id,
      });
    }

    // Update the chat message with attachment stubs
    const msg = await ctx.db.get(args.chatMessageId);
    if (msg && msg.userId === user._id) {
      const existing = msg.attachments ?? [];
      await ctx.db.patch(args.chatMessageId, {
        attachments: [
          ...existing,
          ...attachmentIds.map((a) => ({
            attachmentId: a.attachmentId,
            name: a.name,
            type: a.type,
            mimeType: a.mimeType,
          })),
        ],
      });
    }

    return { attachmentIds: attachmentIds.map((a) => a.attachmentId) };
  },
});

/**
 * Called by the client after uploading files when saving/editing a memory.
 */
export const recordAttachmentsForMemory = mutation({
  args: {
    token: v.optional(v.string()),
    memoryId: v.id("memories"),
    files: v.array(driveAttachmentInput),
  },
  handler: async (ctx, args) => {
    const user = await resolveUser(ctx, args.token);
    const memory = await ctx.db.get(args.memoryId);
    if (!memory || memory.userId !== user._id) throw new Error("Memory not found");

    const now = Date.now();
    const ids: Id<"memoryAttachments">[] = [];

    for (const file of args.files) {
      const attachmentId = await ctx.db.insert("memoryAttachments", {
        userId: user._id,
        memoryId: args.memoryId,
        type: file.type,
        filename: file.filename,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        driveFileId: file.driveFileId,
        driveFolderId: file.driveFolderId,
        driveWebViewLink: file.driveWebViewLink,
        driveThumbnailLink: file.driveThumbnailLink,
        processingStatus: "pending",
        createdAt: now,
      });

      ids.push(attachmentId);

      await ctx.runMutation(internal.analytics.recordProductEvent, {
        userId: user._id,
        event: "attachment_uploaded",
        bytes: file.sizeBytes,
      });
      await ctx.runMutation(internal.analytics.recordStorageDelta, {
        userId: user._id,
        bytesDelta: file.sizeBytes,
        fileCountDelta: 1,
        imageCountDelta: file.type === "image" ? 1 : 0,
        documentCountDelta: file.type === "document" ? 1 : 0,
      });

      await ctx.scheduler.runAfter(0, internal.actions.processAttachment.processAttachment, {
        attachmentId,
        userId: user._id,
      });
    }

    return { attachmentIds: ids };
  },
});

/**
 * Link a chat-only attachment to a memory.
 */
export const linkAttachmentToMemory = mutation({
  args: {
    token: v.optional(v.string()),
    attachmentId: v.id("memoryAttachments"),
    memoryId: v.id("memories"),
  },
  handler: async (ctx, args) => {
    const user = await resolveUser(ctx, args.token);
    const attachment = await ctx.db.get(args.attachmentId);
    if (!attachment || attachment.userId !== user._id) throw new Error("Attachment not found");

    const memory = await ctx.db.get(args.memoryId);
    if (!memory || memory.userId !== user._id) throw new Error("Memory not found");

    await ctx.db.patch(args.attachmentId, { memoryId: args.memoryId });
    return { success: true };
  },
});

/**
 * Delete an attachment from Convex and schedule Drive file deletion.
 */
export const deleteAttachment = mutation({
  args: {
    token: v.optional(v.string()),
    attachmentId: v.id("memoryAttachments"),
  },
  handler: async (ctx, args) => {
    const user = await resolveUser(ctx, args.token);
    const attachment = await ctx.db.get(args.attachmentId);
    if (!attachment || attachment.userId !== user._id) throw new Error("Attachment not found");

    // Remove attachment stub from chat message if linked
    if (attachment.chatMessageId) {
      const msg = await ctx.db.get(attachment.chatMessageId);
      if (msg) {
        const filtered = (msg.attachments ?? []).filter(
          (a) => a.attachmentId !== args.attachmentId,
        );
        await ctx.db.patch(attachment.chatMessageId, { attachments: filtered });
      }
    }

    await ctx.db.delete(args.attachmentId);
    await ctx.runMutation(internal.analytics.recordProductEvent, {
      userId: user._id,
      event: "attachment_deleted",
    });
    await ctx.runMutation(internal.analytics.recordStorageDelta, {
      userId: user._id,
      bytesDelta: -attachment.sizeBytes,
      fileCountDelta: -1,
      imageCountDelta: attachment.type === "image" ? -1 : 0,
      documentCountDelta: attachment.type === "document" ? -1 : 0,
    });

    // Schedule Drive deletion
    await ctx.scheduler.runAfter(0, internal.integrations.deleteDriveFile, {
      userId: user._id,
      driveFileId: attachment.driveFileId,
    });

    return { success: true };
  },
});

// ─── Internal mutations ───────────────────────────────────────────────────────

/**
 * Internal version of recordAttachmentsForMessage — used by the chat action.
 */
export const recordAttachmentsInternal = internalMutation({
  args: {
    userId: v.id("users"),
    chatMessageId: v.id("chatMessages"),
    files: v.array(driveAttachmentInput),
    scheduleProcessing: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const newStubs: Array<{
      attachmentId: Id<"memoryAttachments">;
      name: string;
      type: "image" | "document";
      mimeType: string;
      driveFileId: string;
      driveThumbnailLink?: string;
      driveWebViewLink?: string;
    }> = [];

    for (const file of args.files) {
      const attachmentId = await ctx.db.insert("memoryAttachments", {
        userId: args.userId,
        chatMessageId: args.chatMessageId,
        type: file.type,
        filename: file.filename,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        driveFileId: file.driveFileId,
        driveFolderId: file.driveFolderId,
        driveWebViewLink: file.driveWebViewLink,
        driveThumbnailLink: file.driveThumbnailLink,
        processingStatus: "pending",
        createdAt: now,
      });

      newStubs.push({
        attachmentId,
        name: file.filename,
        type: file.type,
        mimeType: file.mimeType,
        driveFileId: file.driveFileId,
        driveThumbnailLink: file.driveThumbnailLink,
        driveWebViewLink: file.driveWebViewLink,
      });

      await ctx.runMutation(internal.analytics.recordProductEvent, {
        userId: args.userId,
        event: "attachment_uploaded",
        bytes: file.sizeBytes,
      });
      await ctx.runMutation(internal.analytics.recordStorageDelta, {
        userId: args.userId,
        bytesDelta: file.sizeBytes,
        fileCountDelta: 1,
        imageCountDelta: file.type === "image" ? 1 : 0,
        documentCountDelta: file.type === "document" ? 1 : 0,
      });

      if (args.scheduleProcessing ?? true) {
        await ctx.scheduler.runAfter(0, internal.actions.processAttachment.processAttachment, {
          attachmentId,
          userId: args.userId,
        });
      }
    }

    // Patch the chat message with attachment stubs
    const msg = await ctx.db.get(args.chatMessageId);
    if (msg) {
      const existing = msg.attachments ?? [];
      await ctx.db.patch(args.chatMessageId, {
        attachments: [
          ...existing,
          ...newStubs.map((s) => ({
            attachmentId: s.attachmentId,
            name: s.name,
            type: s.type,
            mimeType: s.mimeType,
          })),
        ],
      });
    }

    return {
      attachments: newStubs,
    };
  },
});

/**
 * Links all attachments from a chat message to a memory.
 * Called after create_memory / update_memory so Drive files sent in the
 * same message appear under the memory's attachment count.
 */
export const linkChatAttachmentsToMemory = internalMutation({
  args: {
    chatMessageId: v.id("chatMessages"),
    memoryId: v.id("memories"),
  },
  handler: async (ctx, args) => {
    const attachments = await ctx.db
      .query("memoryAttachments")
      .withIndex("by_chat_message", (q) => q.eq("chatMessageId", args.chatMessageId))
      .collect();
    await Promise.all(
      attachments
        .filter((a) => !a.memoryId)
        .map((a) => ctx.db.patch(a._id, { memoryId: args.memoryId })),
    );
  },
});

export const updateAttachmentStatus = internalMutation({
  args: {
    attachmentId: v.id("memoryAttachments"),
    processingStatus: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    extractedContent: v.optional(v.string()),
    processingError: v.optional(v.string()),
    driveThumbnailLink: v.optional(v.string()),
    driveWebViewLink: v.optional(v.string()),
    extractionMethod: v.optional(
      v.union(
        v.literal("mlkit"),
        v.literal("gemini"),
        v.literal("openai"),
        v.literal("pdf-extract"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const { attachmentId, ...patch } = args;
    // Only patch defined fields
    const update: Record<string, unknown> = {
      processingStatus: patch.processingStatus,
    };
    if (patch.extractedContent !== undefined) update.extractedContent = patch.extractedContent;
    if (patch.processingError !== undefined) update.processingError = patch.processingError;
    if (patch.driveThumbnailLink !== undefined)
      update.driveThumbnailLink = patch.driveThumbnailLink;
    if (patch.driveWebViewLink !== undefined) update.driveWebViewLink = patch.driveWebViewLink;
    if (patch.extractionMethod !== undefined) update.extractionMethod = patch.extractionMethod;
    await ctx.db.patch(attachmentId, update);
  },
});
