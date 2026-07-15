import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { requireAdmin } from "./lib/withAuth";

const DAY_MS = 24 * 60 * 60 * 1000;

const rangeValidator = v.optional(
  v.union(v.literal("7d"), v.literal("30d"), v.literal("90d"), v.literal("365d")),
);
const compareModeValidator = v.optional(v.union(v.literal("off"), v.literal("previous")));
const segmentFamilyValidator = v.optional(
  v.union(
    v.literal("billing"),
    v.literal("behavior"),
    v.literal("lifecycle"),
    v.literal("provider"),
    v.literal("capability"),
  ),
);
const incidentStatusValidator = v.optional(
  v.union(v.literal("open"), v.literal("acknowledged"), v.literal("resolved")),
);
const refreshKeyValidator = v.optional(v.number());

function getRangeDays(range: "7d" | "30d" | "90d" | "365d") {
  switch (range) {
    case "7d":
      return 7;
    case "30d":
      return 30;
    case "90d":
      return 90;
    case "365d":
      return 365;
  }
}

function getDayKey(timestamp: number) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function getCutoffKey(days: number) {
  return getDayKey(Date.now() - (days - 1) * DAY_MS);
}

function shiftDayKey(dayKey: string, byDays: number) {
  return getDayKey(Date.parse(`${dayKey}T00:00:00Z`) + byDays * DAY_MS);
}

async function logAdminAction(args: {
  ctx: MutationCtx;
  actorUserId: Id<"users">;
  action: string;
  targetType: string;
  targetId?: string;
  metadata?: Record<string, string>;
}) {
  await args.ctx.db.insert("adminActionLogs", {
    actorUserId: args.actorUserId,
    action: args.action,
    targetType: args.targetType,
    targetId: args.targetId,
    metadata: args.metadata,
    createdAt: Date.now(),
  });
}

const ROLLUP_SCAN_CAP = 8000;

/**
 * Daily cron: platform-wide counts the admin dashboards need. Scans run here
 * once a day instead of inside every reactive admin query render. Counts are
 * capped at ROLLUP_SCAN_CAP (truncated flag marks lower bounds).
 */
export const rollupAdminDailyStats = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const dayKey = getDayKey(Date.now());
    const [users, preferences, summaries, memoryStats] = await Promise.all([
      ctx.db.query("users").take(ROLLUP_SCAN_CAP),
      ctx.db.query("userAiProviderPreferences").take(ROLLUP_SCAN_CAP),
      ctx.db.query("userAnalyticsSummary").take(ROLLUP_SCAN_CAP),
      ctx.db.query("userMemoryStats").take(ROLLUP_SCAN_CAP),
    ]);

    const cutoff30d = Date.now() - 30 * DAY_MS;
    let totalUsers = 0;
    let newUsers30d = 0;
    for (const user of users as Doc<"users">[]) {
      if (user.deletedAt || user.anonymizedAt) continue;
      totalUsers += 1;
      if (user._creationTime >= cutoff30d) newUsers30d += 1;
    }
    const byokUsers = (preferences as Doc<"userAiProviderPreferences">[]).filter(
      (pref) => pref.byokEnabled,
    ).length;

    let powerUsers = 0;
    let casualUsers = 0;
    let totalDiaryEntries = 0;
    let totalChatMessages = 0;
    let totalAttachmentUploads = 0;
    let allTimeAiRequests = 0;
    let allTimeAiCostUsdMicros = 0;
    let allTimeMemoraAiCostUsdMicros = 0;
    let allTimeByokAiCostUsdMicros = 0;
    let allTimeAiInputTokens = 0;
    let allTimeAiOutputTokens = 0;
    let allTimeSearches = 0;
    for (const summary of summaries as Doc<"userAnalyticsSummary">[]) {
      if ((summary.totalAiRequests ?? 0) >= 200 || (summary.totalSearches ?? 0) >= 300) {
        powerUsers += 1;
      } else {
        casualUsers += 1;
      }
      totalDiaryEntries += summary.totalDiaryEntries;
      totalChatMessages += summary.totalChatMessages;
      totalAttachmentUploads += summary.totalAttachmentUploads;
      allTimeAiRequests += summary.totalAiRequests;
      allTimeAiCostUsdMicros += summary.totalAiCostUsdMicros;
      allTimeMemoraAiCostUsdMicros += summary.totalAiMemoraCostUsdMicros ?? 0;
      allTimeByokAiCostUsdMicros += summary.totalAiByokCostUsdMicros ?? 0;
      allTimeAiInputTokens += summary.totalAiInputTokens;
      allTimeAiOutputTokens += summary.totalAiOutputTokens;
      allTimeSearches += summary.totalSearches ?? 0;
    }

    let totalMemories = 0;
    let totalReminders = 0;
    for (const stats of memoryStats as Doc<"userMemoryStats">[]) {
      totalMemories += stats.totalMemories;
      totalReminders += stats.totalReminders;
    }

    const row = {
      dayKey,
      totalUsers,
      byokUsers,
      newUsers30d,
      powerUsers,
      casualUsers,
      totalMemories,
      totalReminders,
      totalDiaryEntries,
      totalChatMessages,
      totalAttachmentUploads,
      allTimeAiRequests,
      allTimeAiCostUsdMicros,
      allTimeMemoraAiCostUsdMicros,
      allTimeByokAiCostUsdMicros,
      allTimeAiInputTokens,
      allTimeAiOutputTokens,
      allTimeSearches,
      truncated:
        users.length >= ROLLUP_SCAN_CAP ||
        preferences.length >= ROLLUP_SCAN_CAP ||
        summaries.length >= ROLLUP_SCAN_CAP ||
        memoryStats.length >= ROLLUP_SCAN_CAP,
      updatedAt: Date.now(),
    };
    const existing = await ctx.db
      .query("adminDailyStats")
      .withIndex("by_day", (q) => q.eq("dayKey", dayKey))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, row);
    } else {
      await ctx.db.insert("adminDailyStats", row);
    }
    return null;
  },
});

/** Latest platform rollup (today or the most recent day the cron ran). */
async function getLatestAdminDailyStats(ctx: QueryCtx): Promise<Doc<"adminDailyStats"> | null> {
  return await ctx.db.query("adminDailyStats").withIndex("by_day").order("desc").first();
}

async function getSystemHealthSnapshot(ctx: QueryCtx, range: "7d" | "30d" | "90d" | "365d") {
  const windowDays = getRangeDays(range);
  const cutoff = getCutoffKey(windowDays);
  const dailyRows = await ctx.db
    .query("userAnalyticsDaily")
    .withIndex("by_day", (q) => q.gte("dayKey", cutoff))
    .order("desc")
    .take(Math.min(windowDays * 400, 12000));

  let aiRequests = 0;
  let aiErrors = 0;
  let searches = 0;
  let searchLatencyMs = 0;
  let deepSearches = 0;

  const activeSubjects = new Set<string>();
  for (const row of dailyRows) {
    aiRequests += row.aiRequests;
    aiErrors += row.aiErrors;
    searches += row.searches ?? 0;
    searchLatencyMs += row.searchLatencyMs ?? 0;
    deepSearches += row.deepSearches ?? 0;
    if (row.analyticsSubjectId) {
      activeSubjects.add(row.analyticsSubjectId);
    }
  }

  // Platform-wide counts come from the daily rollup (adminDailyStats), not a
  // per-render full-table scan.
  const rollup = await getLatestAdminDailyStats(ctx);
  const byokUsers = rollup?.byokUsers ?? 0;
  const totalUsers = rollup?.totalUsers ?? 0;

  return {
    range,
    totalUsers,
    activeUsers: activeSubjects.size,
    byokUsers,
    aiRequests,
    aiErrors,
    aiFailureRate: aiRequests > 0 ? aiErrors / aiRequests : 0,
    searches,
    deepSearches,
    avgSearchLatencyMs: searches > 0 ? searchLatencyMs / searches : 0,
  };
}

export const dashboardOverview = query({
  args: {
    range: rangeValidator,
    compareMode: compareModeValidator,
    refreshKey: refreshKeyValidator,
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const range = args.range ?? "30d";
    const compareMode = args.compareMode ?? "previous";
    const current = await getSystemHealthSnapshot(ctx, range);

    const prevWindow = getRangeDays(range);
    const currentStart = getCutoffKey(prevWindow);
    const previousStart = getDayKey(Date.now() - (prevWindow * 2 - 1) * DAY_MS);
    const previousEnd = getDayKey(Date.now() - prevWindow * DAY_MS);

    const rows = await ctx.db
      .query("userAnalyticsDaily")
      .withIndex("by_day", (q) => q.gte("dayKey", previousStart))
      .order("desc")
      .take(Math.min(prevWindow * 800, 20000));

    let prevAiRequests = 0;
    let prevAiErrors = 0;
    let prevSearches = 0;
    let prevDeepSearches = 0;
    for (const row of rows as Doc<"userAnalyticsDaily">[]) {
      if (row.dayKey < previousStart || row.dayKey > previousEnd) continue;
      prevAiRequests += row.aiRequests;
      prevAiErrors += row.aiErrors;
      prevSearches += row.searches ?? 0;
      prevDeepSearches += row.deepSearches ?? 0;
    }

    const currentTimeline = (rows as Doc<"userAnalyticsDaily">[])
      .filter((row) => row.dayKey >= currentStart)
      .sort((a, b) => a.dayKey.localeCompare(b.dayKey))
      .reduce((acc, row) => {
        const previous = acc.get(row.dayKey) ?? {
          dayKey: row.dayKey,
          aiRequests: 0,
          searches: 0,
        };
        previous.aiRequests += row.aiRequests;
        previous.searches += row.searches ?? 0;
        acc.set(row.dayKey, previous);
        return acc;
      }, new Map<string, { dayKey: string; aiRequests: number; searches: number }>());
    const previousTimeline = (rows as Doc<"userAnalyticsDaily">[])
      .filter((row) => row.dayKey >= previousStart && row.dayKey <= previousEnd)
      .sort((a, b) => a.dayKey.localeCompare(b.dayKey))
      .reduce((acc, row) => {
        const previous = acc.get(row.dayKey) ?? {
          dayKey: row.dayKey,
          aiRequests: 0,
          searches: 0,
        };
        previous.aiRequests += row.aiRequests;
        previous.searches += row.searches ?? 0;
        acc.set(row.dayKey, previous);
        return acc;
      }, new Map<string, { dayKey: string; aiRequests: number; searches: number }>());

    const modelRows = (await ctx.db
      .query("userAnalyticsModelDaily")
      .withIndex("by_day", (q) => q.gte("dayKey", currentStart))
      .order("desc")
      .take(Math.min(getRangeDays(range) * 1200, 20000))) as Doc<"userAnalyticsModelDaily">[];

    const byProvider = new Map<
      string,
      { requests: number; errors: number; costUsdMicros: number }
    >();
    const byCapability = new Map<
      string,
      { requests: number; errors: number; costUsdMicros: number }
    >();

    for (const row of modelRows) {
      const providerCurrent = byProvider.get(row.provider) ?? {
        requests: 0,
        errors: 0,
        costUsdMicros: 0,
      };
      providerCurrent.requests += row.requests;
      providerCurrent.errors += row.errors;
      providerCurrent.costUsdMicros += row.costUsdMicros;
      byProvider.set(row.provider, providerCurrent);

      const capability =
        row.feature === "memory_search" || row.feature === "deep_search"
          ? "search"
          : row.feature === "audio_transcription"
            ? "transcription"
            : row.feature === "attachment_extraction"
              ? "vision"
              : "chat";
      const capabilityCurrent = byCapability.get(capability) ?? {
        requests: 0,
        errors: 0,
        costUsdMicros: 0,
      };
      capabilityCurrent.requests += row.requests;
      capabilityCurrent.errors += row.errors;
      capabilityCurrent.costUsdMicros += row.costUsdMicros;
      byCapability.set(capability, capabilityCurrent);
    }

    const providerComparison = Array.from(byProvider.entries())
      .map(([key, value]) => ({
        key,
        ...value,
        failureRate: value.requests > 0 ? value.errors / value.requests : 0,
      }))
      .sort((a, b) => b.requests - a.requests)
      .slice(0, 6);

    const capabilityComparison = Array.from(byCapability.entries())
      .map(([key, value]) => ({
        key,
        ...value,
        failureRate: value.requests > 0 ? value.errors / value.requests : 0,
      }))
      .sort((a, b) => b.requests - a.requests)
      .slice(0, 6);

    const incidents = await ctx.db
      .query("adminAlertIncidents")
      .withIndex("by_status_and_triggered_at", (q) => q.eq("status", "open"))
      .order("desc")
      .take(20);
    const timelineRows = Array.from(currentTimeline.values()).sort((a, b) =>
      a.dayKey.localeCompare(b.dayKey),
    );
    const anomalies: Array<{
      key: string;
      severity: "info" | "warning" | "critical";
      title: string;
      message: string;
    }> = [];
    if (current.aiFailureRate >= 0.12) {
      anomalies.push({
        key: "ai_failure_critical",
        severity: "critical",
        title: "AI failures are critically high",
        message: `${(current.aiFailureRate * 100).toFixed(2)}% failure in current window.`,
      });
    } else if (current.aiFailureRate >= 0.08) {
      anomalies.push({
        key: "ai_failure_warning",
        severity: "warning",
        title: "AI failures need attention",
        message: `${(current.aiFailureRate * 100).toFixed(2)}% failure in current window.`,
      });
    }
    if (incidents.length > 0) {
      anomalies.push({
        key: "incident_open",
        severity: incidents.length > 3 ? "critical" : "warning",
        title: "Open incidents detected",
        message: `${incidents.length} active incident${incidents.length > 1 ? "s" : ""} in alerting.`,
      });
    }
    if (current.avgSearchLatencyMs > 900) {
      anomalies.push({
        key: "search_latency",
        severity: "warning",
        title: "Search latency elevated",
        message: `${Math.round(current.avgSearchLatencyMs)}ms average latency.`,
      });
    }

    return {
      current,
      previous: {
        aiRequests: prevAiRequests,
        aiFailureRate: prevAiRequests > 0 ? prevAiErrors / prevAiRequests : 0,
        searches: prevSearches,
        deepSearches: prevDeepSearches,
      },
      comparison: {
        provider: providerComparison,
        capability: capabilityComparison,
      },
      timeline: timelineRows.map((row) => ({
        ...row,
        // Compare against the same calendar position one period earlier,
        // keyed by shifted dayKey — index alignment breaks on gap days.
        compareAiRequests:
          compareMode === "previous"
            ? (previousTimeline.get(shiftDayKey(row.dayKey, -prevWindow))?.aiRequests ?? 0)
            : undefined,
      })),
      openIncidents: incidents.length,
      anomalies,
    };
  },
});

export const analyticsLab = query({
  args: {
    range: rangeValidator,
    segmentFamily: segmentFamilyValidator,
    compareMode: compareModeValidator,
    refreshKey: refreshKeyValidator,
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const range = args.range ?? "30d";
    const segmentFamily = args.segmentFamily ?? "billing";
    const compareMode = args.compareMode ?? "previous";
    const days = getRangeDays(range);
    const currentStart = getCutoffKey(days);
    const previousStart = getDayKey(Date.now() - (days * 2 - 1) * DAY_MS);
    const previousEnd = getDayKey(Date.now() - days * DAY_MS);

    const allDailyRows = await ctx.db
      .query("userAnalyticsDaily")
      .withIndex("by_day", (q) => q.gte("dayKey", previousStart))
      .order("desc")
      .take(Math.min(days * 800, 20000));
    const dailyRows = (allDailyRows as Doc<"userAnalyticsDaily">[])
      .filter((row) => row.dayKey >= currentStart)
      .sort((a, b) => a.dayKey.localeCompare(b.dayKey));
    const previousRows = (allDailyRows as Doc<"userAnalyticsDaily">[])
      .filter((row) => row.dayKey >= previousStart && row.dayKey <= previousEnd)
      .sort((a, b) => a.dayKey.localeCompare(b.dayKey));

    const timeline = new Map<
      string,
      { aiRequests: number; aiErrors: number; searches: number; costUsdMicros: number }
    >();
    for (const row of dailyRows) {
      const current = timeline.get(row.dayKey) ?? {
        aiRequests: 0,
        aiErrors: 0,
        searches: 0,
        costUsdMicros: 0,
      };
      current.aiRequests += row.aiRequests;
      current.aiErrors += row.aiErrors;
      current.searches += row.searches ?? 0;
      current.costUsdMicros += row.aiCostUsdMicros;
      timeline.set(row.dayKey, current);
    }
    const previousTimeline = new Map<string, { aiRequests: number }>();
    for (const row of previousRows) {
      const current = previousTimeline.get(row.dayKey) ?? { aiRequests: 0 };
      current.aiRequests += row.aiRequests;
      previousTimeline.set(row.dayKey, current);
    }

    // User-population segments come from the daily rollup — full-table scans
    // per admin render both amplified reads and silently under-counted past
    // the old 6000-row cap.
    const rollup = await getLatestAdminDailyStats(ctx);

    const segmentRows: Array<{ key: string; users: number; label: string }> = [];
    if (segmentFamily === "billing") {
      const byok = rollup?.byokUsers ?? 0;
      const platform = Math.max(0, (rollup?.totalUsers ?? 0) - byok);
      segmentRows.push(
        { key: "user_byok", users: byok, label: "BYOK users" },
        { key: "memora", users: platform, label: "Platform users" },
      );
    } else if (segmentFamily === "lifecycle") {
      const newUsers = rollup?.newUsers30d ?? 0;
      segmentRows.push(
        { key: "new", users: newUsers, label: "New users (30d)" },
        {
          key: "returning",
          users: Math.max(0, (rollup?.totalUsers ?? 0) - newUsers),
          label: "Returning users",
        },
      );
    } else if (segmentFamily === "behavior") {
      segmentRows.push(
        { key: "power", users: rollup?.powerUsers ?? 0, label: "Power users" },
        { key: "casual", users: rollup?.casualUsers ?? 0, label: "Casual users" },
      );
    } else if (segmentFamily === "provider") {
      const modelRows = (await ctx.db
        .query("userAnalyticsModelDaily")
        .withIndex("by_day", (q) => q.gte("dayKey", currentStart))
        .order("desc")
        .take(Math.min(days * 1200, 20000))) as Doc<"userAnalyticsModelDaily">[];
      const byProvider = new Map<string, number>();
      for (const row of modelRows) {
        byProvider.set(row.provider, (byProvider.get(row.provider) ?? 0) + row.requests);
      }
      for (const [key, value] of byProvider.entries()) {
        segmentRows.push({ key, users: value, label: `${key} requests` });
      }
    } else {
      const modelRows = (await ctx.db
        .query("userAnalyticsModelDaily")
        .withIndex("by_day", (q) => q.gte("dayKey", currentStart))
        .order("desc")
        .take(Math.min(days * 1200, 20000))) as Doc<"userAnalyticsModelDaily">[];
      const byCapability = new Map<string, number>();
      for (const row of modelRows) {
        const capability =
          row.feature === "audio_transcription"
            ? "transcription"
            : row.feature === "attachment_extraction"
              ? "vision"
              : row.feature === "memory_search" || row.feature === "deep_search"
                ? "search"
                : "chat";
        byCapability.set(capability, (byCapability.get(capability) ?? 0) + row.requests);
      }
      for (const [key, value] of byCapability.entries()) {
        segmentRows.push({ key, users: value, label: `${key} requests` });
      }
    }

    return {
      range,
      segmentFamily,
      timeline: Array.from(timeline.entries()).map(([dayKey, value]) => ({
        dayKey,
        ...value,
        // Same-calendar-position compare via shifted dayKey (see dashboardOverview).
        compareAiRequests:
          compareMode === "previous"
            ? (previousTimeline.get(shiftDayKey(dayKey, -days))?.aiRequests ?? 0)
            : undefined,
      })),
      segments: segmentRows.sort((a, b) => b.users - a.users),
    };
  },
});

export const userOpsList = query({
  args: {
    search: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
    refreshKey: refreshKeyValidator,
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const search = args.search?.trim().toLowerCase();
    // Search runs through the users search index BEFORE pagination — the old
    // paginate-then-filter version only matched within the current 20-row
    // page, which made search effectively broken.
    const result = search
      ? await ctx.db
          .query("users")
          .withSearchIndex("search_text", (q) => q.search("searchText", search))
          .paginate(args.paginationOpts)
      : await ctx.db.query("users").order("desc").paginate(args.paginationOpts);

    const filtered = result.page.filter((user) => !user.deletedAt && !user.anonymizedAt);

    const users = await Promise.all(
      filtered.map(async (user) => {
        const [summary, memoryStats, watch] = await Promise.all([
          ctx.db
            .query("userAnalyticsSummary")
            .withIndex("by_user", (q) => q.eq("userId", user._id))
            .unique(),
          ctx.db
            .query("userMemoryStats")
            .withIndex("by_user", (q) => q.eq("userId", user._id))
            .unique(),
          ctx.db
            .query("adminUserWatchlist")
            .withIndex("by_user", (q) => q.eq("userId", user._id))
            .unique(),
        ]);

        return {
          _id: user._id,
          name: user.name,
          email: user.email,
          userType: user.userType ?? "user",
          createdAt: user._creationTime,
          timezone: user.timezone ?? "UTC",
          stats: {
            memories: memoryStats?.totalMemories ?? 0,
            reminders: memoryStats?.totalReminders ?? 0,
            aiRequests: summary?.totalAiRequests ?? 0,
            aiCostUsdMicros: summary?.totalAiCostUsdMicros ?? 0,
            searches: summary?.totalSearches ?? 0,
          },
          watch: watch?.status === "watch",
          watchReason: watch?.reason,
        };
      }),
    );

    return {
      ...result,
      page: users,
    };
  },
});

export const userOpsDetail = query({
  args: {
    userId: v.id("users"),
    range: rangeValidator,
    refreshKey: refreshKeyValidator,
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const range = args.range ?? "30d";
    const days = getRangeDays(range);
    const cutoff = getCutoffKey(days);

    const [user, summary, memoryStats, watch] = await Promise.all([
      ctx.db.get(args.userId),
      ctx.db
        .query("userAnalyticsSummary")
        .withIndex("by_user", (q) => q.eq("userId", args.userId))
        .unique(),
      ctx.db
        .query("userMemoryStats")
        .withIndex("by_user", (q) => q.eq("userId", args.userId))
        .unique(),
      ctx.db
        .query("adminUserWatchlist")
        .withIndex("by_user", (q) => q.eq("userId", args.userId))
        .unique(),
    ]);

    if (!user) {
      throw new Error("User not found.");
    }

    const [daily, aiEvents, sessions] = await Promise.all([
      ctx.db
        .query("userAnalyticsDaily")
        .withIndex("by_user", (q) => q.eq("userId", args.userId))
        .order("desc")
        .take(days)
        .then((rows) => rows.filter((row) => row.dayKey >= cutoff).reverse()),
      ctx.db
        .query("userAiUsageEvents")
        .withIndex("by_user_occurred_at", (q) => q.eq("userId", args.userId))
        .order("desc")
        .take(25),
      ctx.db
        .query("authSessions")
        .withIndex("userId", (q) => q.eq("userId", String(args.userId)))
        .take(100),
    ]);

    return {
      profile: {
        _id: user._id,
        name: user.name,
        email: user.email,
        createdAt: user._creationTime,
        timezone: user.timezone ?? "UTC",
        userType: user.userType ?? "user",
      },
      watch,
      summary: {
        memories: memoryStats?.totalMemories ?? 0,
        reminders: memoryStats?.totalReminders ?? 0,
        aiRequests: summary?.totalAiRequests ?? 0,
        aiCostUsdMicros: summary?.totalAiCostUsdMicros ?? 0,
        searches: summary?.totalSearches ?? 0,
      },
      sessions: {
        activeCount: sessions.length,
      },
      timeline: daily.map((row) => ({
        dayKey: row.dayKey,
        aiRequests: row.aiRequests,
        aiErrors: row.aiErrors,
        searches: row.searches ?? 0,
        deepSearches: row.deepSearches ?? 0,
      })),
      recentAiEvents: aiEvents.map((row) => ({
        _id: row._id,
        occurredAt: row.occurredAt,
        feature: row.feature,
        stage: row.stage ?? row.operation,
        provider: row.provider,
        model: row.model,
        status: row.status,
        visibility: row.visibility ?? "background",
        costUsdMicros: row.costUsdMicros ?? 0,
        totalTokens: row.totalTokens ?? 0,
      })),
    };
  },
});

/** Admin override of the platform daily AI spend cap for one user. null clears back to the platform default. */
export const setUserSpendCap = mutation({
  args: {
    userId: v.id("users"),
    dailySpendCapUsdMicros: v.union(v.number(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const capValue =
      args.dailySpendCapUsdMicros === null
        ? undefined
        : Math.max(0, Math.floor(args.dailySpendCapUsdMicros));

    const existing = await ctx.db
      .query("userAiProviderPreferences")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        dailySpendCapUsdMicros: capValue,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("userAiProviderPreferences", {
        userId: args.userId,
        byokEnabled: false,
        preferredProvider: "openai",
        dailySpendCapUsdMicros: capValue,
        updatedAt: Date.now(),
      });
    }

    await logAdminAction({
      ctx,
      actorUserId: admin.userId,
      action: "user.spend_cap",
      targetType: "user",
      targetId: String(args.userId),
      metadata: { dailySpendCapUsdMicros: String(capValue ?? "default") },
    });
    return null;
  },
});

export const setUserWatchStatus = mutation({
  args: {
    userId: v.id("users"),
    status: v.union(v.literal("watch"), v.literal("clear")),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const existing = await ctx.db
      .query("adminUserWatchlist")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        status: args.status,
        reason: args.reason,
        updatedBy: admin.userId,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("adminUserWatchlist", {
        userId: args.userId,
        status: args.status,
        reason: args.reason,
        updatedBy: admin.userId,
        updatedAt: now,
      });
    }

    await logAdminAction({
      ctx,
      actorUserId: admin.userId,
      action: "user.watch_status",
      targetType: "user",
      targetId: String(args.userId),
      metadata: {
        status: args.status,
        reason: args.reason ?? "",
      },
    });

    return { success: true };
  },
});

export const revokeUserSessions = mutation({
  args: {
    userId: v.id("users"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const rows = await ctx.db
      .query("authSessions")
      .withIndex("userId", (q) => q.eq("userId", String(args.userId)))
      .take(200);
    await Promise.all(rows.map((row) => ctx.db.delete(row._id)));

    await logAdminAction({
      ctx,
      actorUserId: admin.userId,
      action: "user.revoke_sessions",
      targetType: "user",
      targetId: String(args.userId),
      metadata: {
        deletedSessions: String(rows.length),
        reason: args.reason ?? "",
      },
    });

    return { success: true, deleted: rows.length };
  },
});

export const aiOpsOverview = query({
  args: {
    range: rangeValidator,
    refreshKey: refreshKeyValidator,
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    range: "7d" | "30d" | "90d" | "365d";
    providers: Array<{
      key: string;
      requests: number;
      errors: number;
      failureRate: number;
      avgLatencyMs: number;
      costUsdMicros: number;
    }>;
    topModels: Array<{
      provider: string;
      model: string;
      requests: number;
      errors: number;
      costUsdMicros: number;
      failureRate: number;
    }>;
    routing: Array<{
      capability: string;
      provider: string;
      model: string;
      enabled: boolean;
      fallbackProvider?: string;
      fallbackModel?: string;
      fallbackEnabled?: boolean;
    }>;
  }> => {
    await requireAdmin(ctx);
    const range = args.range ?? "30d";
    const cutoff = getCutoffKey(getRangeDays(range));

    // Aggregate over the pre-rolled per-day/model table instead of raw usage
    // events — the old newest-1200-events scan truncated stats on any busy
    // range. Latency (not carried on the rollup) comes from a recent-events
    // sample and is approximate by design.
    const rows = (await ctx.db
      .query("userAnalyticsModelDaily")
      .withIndex("by_day", (q) => q.gte("dayKey", cutoff))
      .order("desc")
      .take(Math.min(getRangeDays(range) * 1200, 20000))) as Doc<"userAnalyticsModelDaily">[];

    const providerMap = new Map<
      string,
      { requests: number; errors: number; costUsdMicros: number }
    >();
    const modelMap = new Map<
      string,
      { provider: string; model: string; requests: number; errors: number; costUsdMicros: number }
    >();

    for (const row of rows) {
      const providerCurrent = providerMap.get(row.provider) ?? {
        requests: 0,
        errors: 0,
        costUsdMicros: 0,
      };
      providerCurrent.requests += row.requests;
      providerCurrent.errors += row.errors;
      providerCurrent.costUsdMicros += row.costUsdMicros;
      providerMap.set(row.provider, providerCurrent);

      const modelKey = `${row.provider}:${row.model}`;
      const modelCurrent = modelMap.get(modelKey) ?? {
        provider: row.provider,
        model: row.model,
        requests: 0,
        errors: 0,
        costUsdMicros: 0,
      };
      modelCurrent.requests += row.requests;
      modelCurrent.errors += row.errors;
      modelCurrent.costUsdMicros += row.costUsdMicros;
      modelMap.set(modelKey, modelCurrent);
    }

    const latencySample = await ctx.db
      .query("userAiUsageEvents")
      .withIndex("by_occurred_at")
      .order("desc")
      .take(300);
    const latencyByProvider = new Map<string, { totalMs: number; count: number }>();
    for (const event of latencySample) {
      if (typeof event.latencyMs !== "number") continue;
      const current = latencyByProvider.get(event.provider) ?? { totalMs: 0, count: 0 };
      current.totalMs += event.latencyMs;
      current.count += 1;
      latencyByProvider.set(event.provider, current);
    }

    const providers = Array.from(providerMap.entries())
      .map(([key, value]) => {
        const latency = latencyByProvider.get(key);
        return {
          key,
          requests: value.requests,
          errors: value.errors,
          failureRate: value.requests > 0 ? value.errors / value.requests : 0,
          avgLatencyMs: latency && latency.count > 0 ? latency.totalMs / latency.count : 0,
          costUsdMicros: value.costUsdMicros,
        };
      })
      .sort((a, b) => b.requests - a.requests);

    const models = Array.from(modelMap.values())
      .map((row) => ({
        ...row,
        failureRate: row.requests > 0 ? row.errors / row.requests : 0,
      }))
      .sort((a, b) => b.requests - a.requests)
      .slice(0, 20);

    const routingRows = await ctx.db.query("aiRoutingConfig").take(20);
    const routing = routingRows.map((row) => ({
      capability: row.capability,
      provider: row.provider,
      model: row.model,
      enabled: row.enabled,
      fallbackProvider: row.fallbackProvider,
      fallbackModel: row.fallbackModel,
      fallbackEnabled: row.fallbackEnabled,
    }));

    return {
      range,
      providers,
      topModels: models,
      routing,
    };
  },
});

export const listAlertRules = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await ctx.db
      .query("adminAlertRules")
      .withIndex("by_enabled_and_updated_at", (q) => q.eq("enabled", true))
      .order("desc")
      .take(200);
  },
});

export const upsertAlertRule = mutation({
  args: {
    key: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    metricKey: v.string(),
    comparison: v.union(v.literal("gt"), v.literal("lt")),
    threshold: v.number(),
    severity: v.union(v.literal("info"), v.literal("warning"), v.literal("critical")),
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const existing = await ctx.db
      .query("adminAlertRules")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        title: args.title,
        description: args.description,
        metricKey: args.metricKey,
        comparison: args.comparison,
        threshold: args.threshold,
        severity: args.severity,
        enabled: args.enabled,
        updatedBy: admin.userId,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("adminAlertRules", {
        key: args.key,
        title: args.title,
        description: args.description,
        metricKey: args.metricKey,
        comparison: args.comparison,
        threshold: args.threshold,
        severity: args.severity,
        enabled: args.enabled,
        updatedBy: admin.userId,
        updatedAt: now,
      });
    }

    await logAdminAction({
      ctx,
      actorUserId: admin.userId,
      action: "alerts.upsert_rule",
      targetType: "alert_rule",
      targetId: args.key,
      metadata: {
        severity: args.severity,
        enabled: String(args.enabled),
      },
    });

    return { success: true };
  },
});

export const evaluateAlertRules = mutation({
  args: {
    range: rangeValidator,
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const range = args.range ?? "7d";
    const snapshot = await getSystemHealthSnapshot(ctx, range);

    const metricMap: Record<string, number> = {
      ai_failure_rate: snapshot.aiFailureRate,
      avg_search_latency_ms: snapshot.avgSearchLatencyMs,
      ai_requests: snapshot.aiRequests,
      deep_searches: snapshot.deepSearches,
    };

    const rules = await ctx.db.query("adminAlertRules").take(200);
    const now = Date.now();

    const hits = await Promise.all(
      (rules as Doc<"adminAlertRules">[]).map(async (rule) => {
        if (!rule.enabled) return false;
        const value = metricMap[rule.metricKey];
        if (value === undefined) return false;
        const hit = rule.comparison === "gt" ? value > rule.threshold : value < rule.threshold;

        const openIncident = await ctx.db
          .query("adminAlertIncidents")
          .withIndex("by_rule_and_triggered_at", (q) => q.eq("ruleKey", rule.key))
          .order("desc")
          .take(10)
          .then((rows) => rows.find((r) => r.status !== "resolved") ?? null);

        if (hit) {
          if (openIncident) {
            await ctx.db.patch(openIncident._id, {
              value,
              threshold: rule.threshold,
              lastEvaluatedAt: now,
              metadata: {
                range,
                metricKey: rule.metricKey,
              },
            });
          } else {
            await ctx.db.insert("adminAlertIncidents", {
              ruleKey: rule.key,
              metricKey: rule.metricKey,
              severity: rule.severity,
              status: "open",
              value,
              threshold: rule.threshold,
              triggeredAt: now,
              lastEvaluatedAt: now,
              metadata: {
                range,
                metricKey: rule.metricKey,
              },
            });
          }
        } else if (openIncident) {
          await ctx.db.patch(openIncident._id, {
            status: "resolved",
            resolvedAt: now,
            lastEvaluatedAt: now,
            value,
          });
        }
        return hit;
      }),
    );
    const triggered = hits.filter(Boolean).length;

    await logAdminAction({
      ctx,
      actorUserId: admin.userId,
      action: "alerts.evaluate",
      targetType: "alerts",
      metadata: {
        range,
        triggered: String(triggered),
      },
    });

    return { success: true, triggered };
  },
});

export const listAlertIncidents = query({
  args: {
    status: incidentStatusValidator,
    paginationOpts: paginationOptsValidator,
    refreshKey: refreshKeyValidator,
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const status = args.status ?? "open";
    return await ctx.db
      .query("adminAlertIncidents")
      .withIndex("by_status_and_triggered_at", (q) => q.eq("status", status))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const setIncidentStatus = mutation({
  args: {
    incidentId: v.id("adminAlertIncidents"),
    status: v.union(v.literal("acknowledged"), v.literal("resolved")),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const incident = await ctx.db.get(args.incidentId);
    if (!incident) {
      throw new Error("Incident not found.");
    }

    const now = Date.now();
    await ctx.db.patch(args.incidentId, {
      status: args.status,
      acknowledgedAt: args.status === "acknowledged" ? now : incident.acknowledgedAt,
      resolvedAt: args.status === "resolved" ? now : incident.resolvedAt,
      lastEvaluatedAt: now,
    });

    await logAdminAction({
      ctx,
      actorUserId: admin.userId,
      action: "alerts.set_incident_status",
      targetType: "incident",
      targetId: String(args.incidentId),
      metadata: {
        status: args.status,
      },
    });

    return { success: true };
  },
});

export const runMaintenanceJob = mutation({
  args: {
    job: v.union(v.literal("cleanup_ai_usage_events"), v.literal("purge_stale_query_cache")),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    if (args.job === "cleanup_ai_usage_events") {
      await ctx.scheduler.runAfter(0, internal.analytics.cleanupOldAiUsageEvents, {});
    } else {
      await ctx.scheduler.runAfter(0, internal.memories.purgeStaleQueryCache, {});
    }

    await logAdminAction({
      ctx,
      actorUserId: admin.userId,
      action: "system.run_maintenance_job",
      targetType: "job",
      targetId: args.job,
    });

    return { queued: true };
  },
});

export const systemHealth = query({
  args: {
    range: rangeValidator,
    refreshKey: refreshKeyValidator,
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const range = args.range ?? "7d";
    const snapshot = await getSystemHealthSnapshot(ctx, range);

    const incidents = await ctx.db
      .query("adminAlertIncidents")
      .withIndex("by_status_and_triggered_at", (q) => q.eq("status", "open"))
      .order("desc")
      .take(20);

    // One indexed point lookup per non-idle status instead of a full-table scan.
    const nonIdleStatuses = [
      "queued",
      "reembedding_memories",
      "rebuilding_topics",
      "failed",
    ] as const;
    const rebuilds = (
      await Promise.all(
        nonIdleStatuses.map((status) =>
          ctx.db
            .query("userAiProviderPreferences")
            .withIndex("by_rebuild_status", (q) => q.eq("embeddingRebuildStatus", status))
            .take(100),
        ),
      )
    ).flat();

    const systemAlerts = await ctx.db
      .query("systemAlerts")
      .take(100)
      .then((rows) =>
        rows.filter((row) => !row.resolvedAt).sort((a, b) => b.updatedAt - a.updatedAt),
      );

    return {
      snapshot,
      systemAlerts,
      openIncidents: incidents,
      embeddingRebuilds: {
        active: rebuilds.length,
      },
      jobs: [
        {
          key: "cleanup_ai_usage_events",
          title: "Cleanup AI usage events",
          detail: "Bound raw usage-event table growth while preserving rollups.",
        },
        {
          key: "purge_stale_query_cache",
          title: "Purge stale search cache",
          detail: "Evict expired semantic search cache rows.",
        },
      ],
    };
  },
});

export const listAdminActions = query({
  args: {
    paginationOpts: paginationOptsValidator,
    actionContains: v.optional(v.string()),
    targetType: v.optional(v.string()),
    actorContains: v.optional(v.string()),
    range: rangeValidator,
    refreshKey: refreshKeyValidator,
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const range = args.range ?? "30d";
    const rangeDays = getRangeDays(range);
    const cutoff = Date.now() - rangeDays * DAY_MS;
    const actionContains = args.actionContains?.trim().toLowerCase();
    const targetType = args.targetType?.trim().toLowerCase();
    const actorContains = args.actorContains?.trim().toLowerCase();

    // Range filter lives in the index scan (createdAt >= cutoff) so pages
    // aren't silently emptied by a post-fetch date filter. Exact action /
    // targetType matches use their dedicated indexes; fuzzy "contains"
    // filters still apply per page (they can't be index-backed).
    const result =
      actionContains && !actionContains.includes(" ")
        ? await ctx.db
            .query("adminActionLogs")
            .withIndex("by_action_and_created_at", (q) =>
              q.eq("action", actionContains).gte("createdAt", cutoff),
            )
            .order("desc")
            .paginate(args.paginationOpts)
        : targetType
          ? await ctx.db
              .query("adminActionLogs")
              .withIndex("by_target_type_and_created_at", (q) =>
                q.eq("targetType", targetType).gte("createdAt", cutoff),
              )
              .order("desc")
              .paginate(args.paginationOpts)
          : await ctx.db
              .query("adminActionLogs")
              .withIndex("by_created_at", (q) => q.gte("createdAt", cutoff))
              .order("desc")
              .paginate(args.paginationOpts);

    const filteredPage = result.page.filter((entry) => {
      if (actionContains && !entry.action.toLowerCase().includes(actionContains)) return false;
      if (targetType && !entry.targetType.toLowerCase().includes(targetType)) return false;
      if (actorContains && !String(entry.actorUserId).toLowerCase().includes(actorContains)) {
        return false;
      }
      return true;
    });

    // Resolve actor display names server-side — the UI previously rendered
    // raw user IDs.
    const actorIds = Array.from(new Set(filteredPage.map((entry) => entry.actorUserId)));
    const actors = await Promise.all(actorIds.map((id) => ctx.db.get(id)));
    const actorById = new Map(
      actors
        .filter((actor): actor is Doc<"users"> => actor !== null)
        .map((actor) => [String(actor._id), { name: actor.name, email: actor.email }] as const),
    );

    return {
      ...result,
      page: filteredPage.map((entry) => ({
        ...entry,
        actor: actorById.get(String(entry.actorUserId)) ?? null,
      })),
    };
  },
});
