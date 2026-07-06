import type { MutationCtx } from "../../_generated/server";
import type { Doc, Id } from "../../_generated/dataModel";

export async function replaceTopicLinksForMemory(ctx: MutationCtx, memory: Doc<"memories">) {
  const existingLinks = await ctx.db
    .query("memoryTopicLinks")
    .withIndex("by_memory", (q) => q.eq("memoryId", memory._id))
    .take(10);
  await Promise.all(existingLinks.map((link) => ctx.db.delete(link._id)));

  const uniqueTopicIds = Array.from(
    new Set(
      [memory.primaryTopicId, ...(memory.topicIds ?? [])].filter(
        (topicId): topicId is Id<"userTopics"> => topicId !== undefined,
      ),
    ),
  );

  await Promise.all(
    uniqueTopicIds.map((topicId) =>
      ctx.db.insert("memoryTopicLinks", {
        userId: memory.userId,
        memoryId: memory._id,
        topicId,
        isPrimary: memory.primaryTopicId === topicId,
        assignedAt: memory._creationTime,
      }),
    ),
  );
}

export async function deleteTopicLinksForMemory(ctx: MutationCtx, memoryId: Id<"memories">) {
  const batchSize = 50;
  while (true) {
    const existingLinks = await ctx.db
      .query("memoryTopicLinks")
      .withIndex("by_memory", (q) => q.eq("memoryId", memoryId))
      .take(batchSize);
    await Promise.all(existingLinks.map((link) => ctx.db.delete(link._id)));
    if (existingLinks.length < batchSize) break;
  }
}
