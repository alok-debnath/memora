import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { getMemorySchedule, inferEntryKind } from "./memoryKind";

type StatsDbCtx = Pick<MutationCtx, "db">;

type UserMemoryStatsDoc = Doc<"userMemoryStats">;
type MemoryDoc = Doc<"memories">;

function getDayKey(timestamp: number) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function getContribution(memory: MemoryDoc | null) {
  if (!memory || memory.status !== "active") {
    return null;
  }

  const schedule = getMemorySchedule(memory);
  const isReminder = inferEntryKind(memory) === "reminder" && !!schedule?.dueAt;

  return {
    totalMemories: isReminder ? 0 : 1,
    totalReminders: isReminder ? 1 : 0,
    recurringCount: schedule?.isRecurring ? 1 : 0,
    dayKey: getDayKey(memory._creationTime),
  };
}

async function getStatsDoc(
  ctx: StatsDbCtx,
  userId: Id<"users">,
): Promise<UserMemoryStatsDoc | null> {
  return await ctx.db
    .query("userMemoryStats")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
}

async function ensureStatsDoc(ctx: StatsDbCtx, userId: Id<"users">): Promise<UserMemoryStatsDoc> {
  const existing = await getStatsDoc(ctx, userId);
  if (existing) {
    return existing;
  }

  const statsId = await ctx.db.insert("userMemoryStats", {
    userId,
    totalMemories: 0,
    totalReminders: 0,
    recurringCount: 0,
    updatedAt: Date.now(),
  });
  const created = await ctx.db.get(statsId);
  if (!created) {
    throw new Error("Failed to initialize user memory stats");
  }
  return created;
}

async function applyDailyDelta(
  ctx: StatsDbCtx,
  userId: Id<"users">,
  dayKey: string,
  delta: number,
) {
  if (delta === 0) {
    return;
  }

  const existing = await ctx.db
    .query("userMemoryDailyCounts")
    .withIndex("by_user_and_day", (q) => q.eq("userId", userId).eq("dayKey", dayKey))
    .unique();

  if (!existing) {
    if (delta > 0) {
      await ctx.db.insert("userMemoryDailyCounts", {
        userId,
        dayKey,
        count: delta,
      });
    }
    return;
  }

  const nextCount = Math.max(0, existing.count + delta);
  if (nextCount === 0) {
    await ctx.db.delete(existing._id);
    return;
  }

  if (nextCount !== existing.count) {
    await ctx.db.patch(existing._id, { count: nextCount });
  }
}

export async function applyUserMemoryStatsTransition(
  ctx: StatsDbCtx,
  previous: MemoryDoc | null,
  next: MemoryDoc | null,
) {
  const targetUserId = next?.userId ?? previous?.userId;
  if (!targetUserId) {
    return;
  }

  const previousContribution = getContribution(previous);
  const nextContribution = getContribution(next);

  const totalMemoriesDelta =
    (nextContribution?.totalMemories ?? 0) - (previousContribution?.totalMemories ?? 0);
  const totalRemindersDelta =
    (nextContribution?.totalReminders ?? 0) - (previousContribution?.totalReminders ?? 0);
  const recurringDelta =
    (nextContribution?.recurringCount ?? 0) - (previousContribution?.recurringCount ?? 0);

  const sameDay = previousContribution?.dayKey === nextContribution?.dayKey;
  const previousDayDelta = previousContribution && !sameDay ? -1 : 0;
  const nextDayDelta = nextContribution ? 1 : 0;

  if (
    totalMemoriesDelta === 0 &&
    totalRemindersDelta === 0 &&
    recurringDelta === 0 &&
    previousDayDelta === 0 &&
    (!nextContribution || sameDay)
  ) {
    return;
  }

  const stats = await ensureStatsDoc(ctx, targetUserId);
  await ctx.db.patch(stats._id, {
    totalMemories: Math.max(0, stats.totalMemories + totalMemoriesDelta),
    totalReminders: Math.max(0, stats.totalReminders + totalRemindersDelta),
    recurringCount: Math.max(0, stats.recurringCount + recurringDelta),
    updatedAt: Date.now(),
  });

  if (previousContribution && !sameDay) {
    await applyDailyDelta(ctx, targetUserId, previousContribution.dayKey, -1);
  }

  if (nextContribution) {
    const delta = sameDay ? 0 : 1;
    if (delta !== 0) {
      await applyDailyDelta(ctx, targetUserId, nextContribution.dayKey, delta);
    }
  }
}

export async function rebuildUserMemoryStats(ctx: StatsDbCtx, userId: Id<"users">) {
  const stats = await ensureStatsDoc(ctx, userId);

  while (true) {
    const batch = await ctx.db
      .query("userMemoryDailyCounts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(200);
    for (const row of batch) {
      await ctx.db.delete(row._id);
    }
    if (batch.length < 200) {
      break;
    }
  }

  let totalMemories = 0;
  let totalReminders = 0;
  let recurringCount = 0;
  const dailyCounts = new Map<string, number>();

  const memories = ctx.db
    .query("memories")
    .withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", "active"));

  for await (const memory of memories) {
    const contribution = getContribution(memory);
    if (!contribution) {
      continue;
    }

    totalMemories += contribution.totalMemories;
    totalReminders += contribution.totalReminders;
    recurringCount += contribution.recurringCount;
    dailyCounts.set(contribution.dayKey, (dailyCounts.get(contribution.dayKey) ?? 0) + 1);
  }

  await ctx.db.patch(stats._id, {
    totalMemories,
    totalReminders,
    recurringCount,
    updatedAt: Date.now(),
  });

  for (const [dayKey, count] of dailyCounts.entries()) {
    await ctx.db.insert("userMemoryDailyCounts", {
      userId,
      dayKey,
      count,
    });
  }
}
