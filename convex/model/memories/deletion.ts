import type { MutationCtx } from "../../_generated/server";
import type { Doc, Id } from "../../_generated/dataModel";
import { internal } from "../../_generated/api";
import { serializeMemorySnapshot } from "../../lib/memorySnapshot";
import { applyUserMemoryStatsTransition } from "../../lib/memoryStats";
import { deleteTopicLinksForMemory } from "./topicLinks";

const RELATED_DELETE_BATCH = 200;

export async function deleteMemoryRelatedData(ctx: MutationCtx, memoryId: Id<"memories">) {
  while (true) {
    const attachments = await ctx.db
      .query("memoryAttachments")
      .withIndex("by_memory", (q) => q.eq("memoryId", memoryId))
      .take(RELATED_DELETE_BATCH);
    await Promise.all(
      attachments.map(async (doc) => {
        await ctx.scheduler.runAfter(0, internal.integrations.deleteDriveFile, {
          userId: doc.userId,
          driveFileId: doc.driveFileId,
        });
        await ctx.db.delete(doc._id);
      }),
    );
    if (attachments.length < RELATED_DELETE_BATCH) break;
  }

  while (true) {
    const historyItems = await ctx.db
      .query("memoryHistory")
      .withIndex("by_memory", (q) => q.eq("memoryId", memoryId))
      .take(RELATED_DELETE_BATCH);
    await Promise.all(historyItems.map((doc) => ctx.db.delete(doc._id)));
    if (historyItems.length < RELATED_DELETE_BATCH) break;
  }

  while (true) {
    const sharedMemories = await ctx.db
      .query("sharedMemories")
      .withIndex("by_memory", (q) => q.eq("memoryId", memoryId))
      .take(RELATED_DELETE_BATCH);
    await Promise.all(sharedMemories.map((doc) => ctx.db.delete(doc._id)));
    if (sharedMemories.length < RELATED_DELETE_BATCH) break;
  }

  await deleteTopicLinksForMemory(ctx, memoryId);
}

export async function permanentlyDeleteMemory(ctx: MutationCtx, memory: Doc<"memories">) {
  if (memory.googleEventId) {
    await ctx.scheduler.runAfter(0, internal.integrations.deleteGoogleEvent, {
      userId: memory.userId,
      googleEventId: memory.googleEventId,
    });
  }

  await ctx.scheduler.runAfter(0, internal.integrations.deleteGoogleEventsForMemory, {
    userId: memory.userId,
    memoryId: memory._id,
  });

  await deleteMemoryRelatedData(ctx, memory._id);
  await ctx.db.delete(memory._id);
}

export async function softDeleteMemory(
  ctx: MutationCtx,
  args: {
    memoryId: Id<"memories">;
    memory: Doc<"memories">;
    userId: Id<"users">;
  },
) {
  const { memoryId, memory, userId } = args;
  await ctx.db.insert("memoryHistory", {
    memoryId,
    userId,
    previousTitle: memory.title,
    previousContent: memory.content,
    editedAt: Date.now(),
    changeReason: "deleted",
    snapshotJson: serializeMemorySnapshot(memory),
  });

  const topicIds = Array.from(
    new Set(
      [memory.primaryTopicId, ...(memory.topicIds ?? [])].filter(
        (topicId): topicId is Id<"userTopics"> => topicId !== undefined,
      ),
    ),
  );
  if (topicIds.length > 0) {
    await ctx.runMutation(internal.userTopics.decrementOrArchiveTopics, {
      topicIds,
    });
  }

  const googleEventIdToDelete = memory.googleEventId;
  const nextMemory = {
    ...memory,
    status: "deleted" as const,
    deletedAt: Date.now(),
  };
  await ctx.db.patch(memoryId, {
    status: nextMemory.status,
    deletedAt: nextMemory.deletedAt,
    googleEventId: undefined,
    googleSyncStatus: undefined,
    googleSyncMessage: undefined,
    googleSyncUpdatedAt: Date.now(),
    googleSyncLockToken: undefined,
    googleSyncLockAt: undefined,
    googleSyncFingerprint: undefined,
    googleSyncDesiredFingerprint: undefined,
  });
  await applyUserMemoryStatsTransition(ctx, memory, nextMemory);

  if (googleEventIdToDelete) {
    await ctx.scheduler.runAfter(0, internal.integrations.deleteGoogleEvent, {
      userId,
      googleEventId: googleEventIdToDelete,
    });
  }

  // Soft-delete all Drive attachments so they're hidden from the files section
  const attachmentsToHide = await ctx.db
    .query("memoryAttachments")
    .withIndex("by_memory", (q) => q.eq("memoryId", memoryId))
    .collect();
  await Promise.all(attachmentsToHide.map((a) => ctx.db.patch(a._id, { isDeleted: true })));
  const visibleAttachments = attachmentsToHide.filter(
    (attachment) => attachment.isDeleted !== true,
  );
  if (visibleAttachments.length > 0) {
    await ctx.runMutation(internal.analytics.recordStorageDelta, {
      userId,
      bytesDelta: -visibleAttachments.reduce((sum, attachment) => sum + attachment.sizeBytes, 0),
      fileCountDelta: -visibleAttachments.length,
      imageCountDelta: -visibleAttachments.filter((attachment) => attachment.type === "image")
        .length,
      documentCountDelta: -visibleAttachments.filter((attachment) => attachment.type === "document")
        .length,
    });
  }
}
