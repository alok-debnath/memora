import { internal } from "../../../_generated/api";
import type { Doc } from "../../../_generated/dataModel";
import { getMemorySchedule, isReminder } from "../../memoryKind";
import { DIARY_STATS_FETCH } from "../budgets";
import type { MemoryDoc } from "../types";
import type { ChatTool } from "./toolTypes";

/**
 * Aggregate stats stay a dedicated tool rather than a list_docs primitive —
 * exact totals come from the stats/analytics tables, not a capped list, and
 * computing them from list_docs would waste context re-deriving a cheap
 * server-side aggregate on every "how many memories" question.
 */
export const getStatsTool: ChatTool = {
  name: "get_stats",
  label: "Compute stats",
  kind: "read",
  definition: {
    type: "function",
    function: {
      name: "get_stats",
      description:
        "Get statistics about the user's memories including reminders, recurring items, and recent activity.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  },
  buildStatus: () => ({
    phase: "analyzing",
    detail: "Computing memory statistics",
    source: "memories",
    events: [{ label: "Analysis", value: "counts and trends" }],
  }),
  handler: async (tc) => {
    // Exact totals come from the aggregate stats table (via the digest
    // query); the recent-memories list is capped, so counting it would
    // undercount large accounts. The list only feeds the recent/recurring
    // scans below.
    const digest = tc.knowledgeDigest;
    const [memories, diaryEntries] = await Promise.all([
      tc.getRecentMemories(),
      tc.ctx.runQuery(internal.diary.listRecentInternal, {
        userId: tc.userId,
        limit: DIARY_STATS_FETCH,
      }) as Promise<Doc<"diaryEntries">[]>,
    ]);
    let withReminders = 0;
    let recurring = 0;

    for (const memory of memories) {
      if (isReminder(memory)) withReminders += 1;
      if (getMemorySchedule(memory)?.isRecurring) recurring += 1;
    }

    const totalMemories = digest?.totalMemories ?? memories.length;
    const totalReminders = digest?.totalReminders ?? withReminders;
    const totalDiaryEntries = digest?.totalDiaryEntries ?? diaryEntries.length;

    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recentCount = memories.filter(
      (memory: MemoryDoc) => memory._creationTime >= weekAgo,
    ).length;
    const monthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const moodDistribution: Record<string, number> = {};
    for (const entry of diaryEntries) {
      if (entry._creationTime >= monthAgo && entry.mood) {
        moodDistribution[entry.mood] = (moodDistribution[entry.mood] ?? 0) + 1;
      }
    }
    await tc.reportProgress({
      phase: "analyzing",
      detail: `Computed stats across ${totalMemories} stored memories`,
      source: "memories",
      resultCount: totalMemories,
      events: [
        { label: "Reminders", value: `${totalReminders}` },
        { label: "Recurring", value: `${recurring}` },
        { label: "Recent 7d", value: `${recentCount}` },
      ],
    });
    return JSON.stringify({
      total: totalMemories,
      withReminders: totalReminders,
      recurring,
      recentCount,
      diaryEntries: totalDiaryEntries,
      moodLast30Days: moodDistribution,
    });
  },
};
