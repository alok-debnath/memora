import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireAdmin, resolveUser } from "./lib/withAuth";

const DAY_MS = 24 * 60 * 60 * 1000;
const RAW_EVENT_RETENTION_MS = 90 * DAY_MS;

const productEventValidator = v.union(
  v.literal("memory_created"),
  v.literal("memory_updated"),
  v.literal("memory_deleted"),
  v.literal("diary_created"),
  v.literal("chat_message"),
  v.literal("attachment_uploaded"),
  v.literal("attachment_deleted"),
);

const rangeValidator = v.optional(
  v.union(v.literal("7d"), v.literal("30d"), v.literal("90d"), v.literal("365d"), v.literal("all")),
);

function getDayKey(timestamp: number) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function getRangeDays(range: "7d" | "30d" | "90d" | "365d" | "all") {
  switch (range) {
    case "7d":
      return 7;
    case "30d":
      return 30;
    case "90d":
      return 90;
    case "365d":
      return 365;
    case "all":
      return 400;
  }
}

type SummaryDoc = Doc<"userAnalyticsSummary">;
type DailyDoc = Doc<"userAnalyticsDaily">;
type ModelDailyDoc = Doc<"userAnalyticsModelDaily">;

const searchFeatureValidator = v.union(
  v.literal("memory_search"),
  v.literal("memory_chat"),
  v.literal("deep_search"),
  v.literal("conflict_detection"),
);

async function ensureAnalyticsSubjectId(
  ctx: Pick<MutationCtx, "db">,
  userId: Id<"users">,
): Promise<string> {
  const user = await ctx.db.get(userId);
  if (!user) {
    throw new Error("User not found");
  }
  if (user.analyticsSubjectId) {
    return user.analyticsSubjectId;
  }
  const analyticsSubjectId = `subj_${userId}`;
  await ctx.db.patch(userId, { analyticsSubjectId });
  return analyticsSubjectId;
}

async function getSummary(
  ctx: Pick<MutationCtx, "db">,
  userId: Id<"users">,
): Promise<SummaryDoc | null> {
  return await ctx.db
    .query("userAnalyticsSummary")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
}

async function ensureSummary(
  ctx: Pick<MutationCtx, "db">,
  userId: Id<"users">,
): Promise<SummaryDoc> {
  const existing = await getSummary(ctx, userId);
  if (existing) {
    return existing;
  }
  const now = Date.now();
  const id = await ctx.db.insert("userAnalyticsSummary", {
    userId,
    analyticsSubjectId: await ensureAnalyticsSubjectId(ctx, userId),
    trackingStartedAt: now,
    totalMemoryCreates: 0,
    totalMemoryUpdates: 0,
    totalMemoryDeletes: 0,
    totalDiaryEntries: 0,
    totalChatMessages: 0,
    totalAttachmentUploads: 0,
    totalAttachmentDeletes: 0,
    totalAttachmentBytesUploaded: 0,
    liveStorageBytes: 0,
    liveStorageCount: 0,
    liveImageCount: 0,
    liveDocumentCount: 0,
    totalAiRequests: 0,
    totalAiErrors: 0,
    totalAiInputTokens: 0,
    totalAiOutputTokens: 0,
    totalAiAudioSeconds: 0,
    totalAiCostUsdMicros: 0,
    totalSearches: 0,
    totalDeepSearches: 0,
    totalSearchCacheHits: 0,
    totalVectorSearches: 0,
    totalFullTextSearches: 0,
    totalKeywordSearches: 0,
    totalSearchResults: 0,
    totalSearchLatencyMs: 0,
    updatedAt: now,
  });
  const created = await ctx.db.get(id);
  if (!created) {
    throw new Error("Failed to initialize analytics summary");
  }
  return created;
}

async function getOrCreateDaily(
  ctx: Pick<MutationCtx, "db">,
  userId: Id<"users">,
  dayKey: string,
): Promise<DailyDoc> {
  const existing = await ctx.db
    .query("userAnalyticsDaily")
    .withIndex("by_user_and_day", (q) => q.eq("userId", userId).eq("dayKey", dayKey))
    .unique();
  if (existing) {
    return existing;
  }
  const now = Date.now();
  const id = await ctx.db.insert("userAnalyticsDaily", {
    userId,
    analyticsSubjectId: await ensureAnalyticsSubjectId(ctx, userId),
    dayKey,
    memoryCreates: 0,
    memoryUpdates: 0,
    memoryDeletes: 0,
    diaryEntries: 0,
    chatMessages: 0,
    attachmentUploads: 0,
    attachmentDeletes: 0,
    attachmentBytesUploaded: 0,
    aiRequests: 0,
    aiErrors: 0,
    aiInputTokens: 0,
    aiOutputTokens: 0,
    aiAudioSeconds: 0,
    aiCostUsdMicros: 0,
    searches: 0,
    deepSearches: 0,
    searchCacheHits: 0,
    vectorSearches: 0,
    fullTextSearches: 0,
    keywordSearches: 0,
    searchResults: 0,
    searchLatencyMs: 0,
    updatedAt: now,
  });
  const created = await ctx.db.get(id);
  if (!created) {
    throw new Error("Failed to initialize daily analytics");
  }
  return created;
}

async function getOrCreateModelDaily(
  ctx: Pick<MutationCtx, "db">,
  args: {
    userId: Id<"users">;
    dayKey: string;
    provider: string;
    model: string;
    operation: string;
    feature: string;
  },
): Promise<ModelDailyDoc> {
  const rows = await ctx.db
    .query("userAnalyticsModelDaily")
    .withIndex("by_user_day_model", (q) =>
      q
        .eq("userId", args.userId)
        .eq("dayKey", args.dayKey)
        .eq("provider", args.provider)
        .eq("model", args.model),
    )
    .take(20);
  const existing =
    rows.find((row) => row.operation === args.operation && row.feature === args.feature) ?? null;
  if (existing) {
    return existing;
  }
  const now = Date.now();
  const id = await ctx.db.insert("userAnalyticsModelDaily", {
    userId: args.userId,
    analyticsSubjectId: await ensureAnalyticsSubjectId(ctx, args.userId),
    dayKey: args.dayKey,
    provider: args.provider,
    model: args.model,
    operation: args.operation,
    feature: args.feature,
    requests: 0,
    errors: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    audioSeconds: 0,
    costUsdMicros: 0,
    updatedAt: now,
  });
  const created = await ctx.db.get(id);
  if (!created) {
    throw new Error("Failed to initialize model analytics");
  }
  return created;
}

function clampNonNegative(value: number) {
  return Math.max(0, value);
}

export const ensureUserSummary = internalMutation({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    await ensureSummary(ctx, args.userId);
    return null;
  },
});

export const recordProductEvent = internalMutation({
  args: {
    userId: v.id("users"),
    event: productEventValidator,
    occurredAt: v.optional(v.number()),
    quantity: v.optional(v.number()),
    bytes: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = args.occurredAt ?? Date.now();
    const quantity = Math.max(1, Math.floor(args.quantity ?? 1));
    const bytes = Math.max(0, Math.floor(args.bytes ?? 0));
    const dayKey = getDayKey(now);
    const analyticsSubjectId = await ensureAnalyticsSubjectId(ctx, args.userId);
    const summary = await ensureSummary(ctx, args.userId);
    const daily = await getOrCreateDaily(ctx, args.userId, dayKey);

    const summaryPatch: Partial<SummaryDoc> = {
      analyticsSubjectId,
      lastActivityAt: now,
      updatedAt: now,
    };
    const dailyPatch: Partial<DailyDoc> = {
      analyticsSubjectId,
      updatedAt: now,
    };

    if (args.event === "memory_created") {
      summaryPatch.totalMemoryCreates = summary.totalMemoryCreates + quantity;
      dailyPatch.memoryCreates = daily.memoryCreates + quantity;
    } else if (args.event === "memory_updated") {
      summaryPatch.totalMemoryUpdates = summary.totalMemoryUpdates + quantity;
      dailyPatch.memoryUpdates = daily.memoryUpdates + quantity;
    } else if (args.event === "memory_deleted") {
      summaryPatch.totalMemoryDeletes = summary.totalMemoryDeletes + quantity;
      dailyPatch.memoryDeletes = daily.memoryDeletes + quantity;
    } else if (args.event === "diary_created") {
      summaryPatch.totalDiaryEntries = summary.totalDiaryEntries + quantity;
      dailyPatch.diaryEntries = daily.diaryEntries + quantity;
    } else if (args.event === "chat_message") {
      summaryPatch.totalChatMessages = summary.totalChatMessages + quantity;
      dailyPatch.chatMessages = daily.chatMessages + quantity;
    } else if (args.event === "attachment_uploaded") {
      summaryPatch.totalAttachmentUploads = summary.totalAttachmentUploads + quantity;
      summaryPatch.totalAttachmentBytesUploaded = summary.totalAttachmentBytesUploaded + bytes;
      dailyPatch.attachmentUploads = daily.attachmentUploads + quantity;
      dailyPatch.attachmentBytesUploaded = daily.attachmentBytesUploaded + bytes;
    } else if (args.event === "attachment_deleted") {
      summaryPatch.totalAttachmentDeletes = summary.totalAttachmentDeletes + quantity;
      dailyPatch.attachmentDeletes = daily.attachmentDeletes + quantity;
    }

    await ctx.db.patch(summary._id, summaryPatch);
    await ctx.db.patch(daily._id, dailyPatch);
    return null;
  },
});

export const recordStorageDelta = internalMutation({
  args: {
    userId: v.id("users"),
    bytesDelta: v.number(),
    fileCountDelta: v.number(),
    imageCountDelta: v.optional(v.number()),
    documentCountDelta: v.optional(v.number()),
    occurredAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const analyticsSubjectId = await ensureAnalyticsSubjectId(ctx, args.userId);
    const summary = await ensureSummary(ctx, args.userId);
    await ctx.db.patch(summary._id, {
      analyticsSubjectId,
      liveStorageBytes: clampNonNegative(summary.liveStorageBytes + args.bytesDelta),
      liveStorageCount: clampNonNegative(summary.liveStorageCount + args.fileCountDelta),
      liveImageCount: clampNonNegative(summary.liveImageCount + (args.imageCountDelta ?? 0)),
      liveDocumentCount: clampNonNegative(
        summary.liveDocumentCount + (args.documentCountDelta ?? 0),
      ),
      lastActivityAt: args.occurredAt ?? Date.now(),
      updatedAt: args.occurredAt ?? Date.now(),
    });
    return null;
  },
});

export const recordSearchUsage = internalMutation({
  args: {
    userId: v.id("users"),
    occurredAt: v.optional(v.number()),
    feature: searchFeatureValidator,
    status: v.union(v.literal("success"), v.literal("error")),
    latencyMs: v.optional(v.number()),
    resultCount: v.optional(v.number()),
    usedVector: v.boolean(),
    usedFullText: v.boolean(),
    usedKeyword: v.boolean(),
    cacheHit: v.boolean(),
    isDeepSearch: v.boolean(),
    metadata: v.optional(v.record(v.string(), v.string())),
  },
  handler: async (ctx, args) => {
    const now = args.occurredAt ?? Date.now();
    const dayKey = getDayKey(now);
    const analyticsSubjectId = await ensureAnalyticsSubjectId(ctx, args.userId);
    const summary = await ensureSummary(ctx, args.userId);
    const daily = await getOrCreateDaily(ctx, args.userId, dayKey);
    const latencyMs = Math.max(0, Math.floor(args.latencyMs ?? 0));
    const resultCount = Math.max(0, Math.floor(args.resultCount ?? 0));

    await ctx.db.insert("userAiUsageEvents", {
      userId: args.userId,
      analyticsSubjectId,
      occurredAt: now,
      dayKey,
      provider: "memora",
      model: "search_pipeline",
      operation: "search",
      feature: args.feature,
      status: args.status,
      latencyMs: latencyMs || undefined,
      costAvailability: "unavailable",
      metadata: {
        ...(args.metadata ?? {}),
        kind: "search",
        cacheHit: args.cacheHit ? "true" : "false",
        usedVector: args.usedVector ? "true" : "false",
        usedFullText: args.usedFullText ? "true" : "false",
        usedKeyword: args.usedKeyword ? "true" : "false",
        resultCount: String(resultCount),
      },
    });

    await ctx.db.patch(summary._id, {
      analyticsSubjectId,
      totalSearches: (summary.totalSearches ?? 0) + 1,
      totalDeepSearches: (summary.totalDeepSearches ?? 0) + (args.isDeepSearch ? 1 : 0),
      totalSearchCacheHits: (summary.totalSearchCacheHits ?? 0) + (args.cacheHit ? 1 : 0),
      totalVectorSearches: (summary.totalVectorSearches ?? 0) + (args.usedVector ? 1 : 0),
      totalFullTextSearches: (summary.totalFullTextSearches ?? 0) + (args.usedFullText ? 1 : 0),
      totalKeywordSearches: (summary.totalKeywordSearches ?? 0) + (args.usedKeyword ? 1 : 0),
      totalSearchResults: (summary.totalSearchResults ?? 0) + resultCount,
      totalSearchLatencyMs: (summary.totalSearchLatencyMs ?? 0) + latencyMs,
      lastActivityAt: now,
      updatedAt: now,
    });

    await ctx.db.patch(daily._id, {
      analyticsSubjectId,
      searches: (daily.searches ?? 0) + 1,
      deepSearches: (daily.deepSearches ?? 0) + (args.isDeepSearch ? 1 : 0),
      searchCacheHits: (daily.searchCacheHits ?? 0) + (args.cacheHit ? 1 : 0),
      vectorSearches: (daily.vectorSearches ?? 0) + (args.usedVector ? 1 : 0),
      fullTextSearches: (daily.fullTextSearches ?? 0) + (args.usedFullText ? 1 : 0),
      keywordSearches: (daily.keywordSearches ?? 0) + (args.usedKeyword ? 1 : 0),
      searchResults: (daily.searchResults ?? 0) + resultCount,
      searchLatencyMs: (daily.searchLatencyMs ?? 0) + latencyMs,
      updatedAt: now,
    });
    return null;
  },
});

export const recordAiUsage = internalMutation({
  args: {
    userId: v.id("users"),
    occurredAt: v.optional(v.number()),
    provider: v.string(),
    model: v.string(),
    operation: v.string(),
    feature: v.string(),
    status: v.union(v.literal("success"), v.literal("error")),
    latencyMs: v.optional(v.number()),
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
    totalTokens: v.optional(v.number()),
    audioSeconds: v.optional(v.number()),
    costUsdMicros: v.optional(v.number()),
    costAvailability: v.union(v.literal("estimated"), v.literal("exact"), v.literal("unavailable")),
    metadata: v.optional(v.record(v.string(), v.string())),
  },
  handler: async (ctx, args) => {
    const now = args.occurredAt ?? Date.now();
    const dayKey = getDayKey(now);
    const analyticsSubjectId = await ensureAnalyticsSubjectId(ctx, args.userId);
    const summary = await ensureSummary(ctx, args.userId);
    const daily = await getOrCreateDaily(ctx, args.userId, dayKey);
    const modelDaily = await getOrCreateModelDaily(ctx, {
      userId: args.userId,
      dayKey,
      provider: args.provider,
      model: args.model,
      operation: args.operation,
      feature: args.feature,
    });

    const inputTokens = Math.max(0, Math.floor(args.inputTokens ?? 0));
    const outputTokens = Math.max(0, Math.floor(args.outputTokens ?? 0));
    const totalTokens = Math.max(0, Math.floor(args.totalTokens ?? inputTokens + outputTokens));
    const audioSeconds = Math.max(0, Math.round(args.audioSeconds ?? 0));
    const costUsdMicros = Math.max(0, Math.floor(args.costUsdMicros ?? 0));

    await ctx.db.insert("userAiUsageEvents", {
      userId: args.userId,
      analyticsSubjectId,
      occurredAt: now,
      dayKey,
      provider: args.provider,
      model: args.model,
      operation: args.operation,
      feature: args.feature,
      status: args.status,
      latencyMs: args.latencyMs,
      inputTokens: inputTokens || undefined,
      outputTokens: outputTokens || undefined,
      totalTokens: totalTokens || undefined,
      audioSeconds: audioSeconds || undefined,
      costUsdMicros: costUsdMicros || undefined,
      costAvailability: args.costAvailability,
      metadata: args.metadata,
    });

    await ctx.db.patch(summary._id, {
      analyticsSubjectId,
      totalAiRequests: summary.totalAiRequests + 1,
      totalAiErrors: summary.totalAiErrors + (args.status === "error" ? 1 : 0),
      totalAiInputTokens: summary.totalAiInputTokens + inputTokens,
      totalAiOutputTokens: summary.totalAiOutputTokens + outputTokens,
      totalAiAudioSeconds: summary.totalAiAudioSeconds + audioSeconds,
      totalAiCostUsdMicros: summary.totalAiCostUsdMicros + costUsdMicros,
      lastActivityAt: now,
      updatedAt: now,
    });

    await ctx.db.patch(daily._id, {
      analyticsSubjectId,
      aiRequests: daily.aiRequests + 1,
      aiErrors: daily.aiErrors + (args.status === "error" ? 1 : 0),
      aiInputTokens: daily.aiInputTokens + inputTokens,
      aiOutputTokens: daily.aiOutputTokens + outputTokens,
      aiAudioSeconds: daily.aiAudioSeconds + audioSeconds,
      aiCostUsdMicros: daily.aiCostUsdMicros + costUsdMicros,
      updatedAt: now,
    });

    await ctx.db.patch(modelDaily._id, {
      analyticsSubjectId,
      requests: modelDaily.requests + 1,
      errors: modelDaily.errors + (args.status === "error" ? 1 : 0),
      inputTokens: modelDaily.inputTokens + inputTokens,
      outputTokens: modelDaily.outputTokens + outputTokens,
      totalTokens: modelDaily.totalTokens + totalTokens,
      audioSeconds: modelDaily.audioSeconds + audioSeconds,
      costUsdMicros: modelDaily.costUsdMicros + costUsdMicros,
      updatedAt: now,
    });
    return null;
  },
});

function filterDailyByRange<T extends { dayKey: string }>(
  rows: T[],
  range: "7d" | "30d" | "90d" | "365d" | "all",
) {
  if (range === "all") {
    return rows;
  }
  const cutoff = getDayKey(Date.now() - (getRangeDays(range) - 1) * DAY_MS);
  return rows.filter((row) => row.dayKey >= cutoff);
}

export const overview = query({
  args: {
    token: v.string(),
    range: rangeValidator,
  },
  handler: async (ctx, args) => {
    const { userId } = await resolveUser(ctx, args.token);
    const range = args.range ?? "30d";
    const summary = await ctx.db
      .query("userAnalyticsSummary")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    const dailyRows = filterDailyByRange(
      await ctx.db
        .query("userAnalyticsDaily")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .order("desc")
        .take(getRangeDays(range)),
      range,
    ).reverse();
    const modelRows = filterDailyByRange(
      await ctx.db
        .query("userAnalyticsModelDaily")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .order("desc")
        .take(Math.max(getRangeDays(range) * 8, 40)),
      range,
    );

    const memoryStats = await ctx.db
      .query("userMemoryStats")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    const memoryDaily = await ctx.db
      .query("userMemoryDailyCounts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(366);
    const diaryEntries = await ctx.db
      .query("diaryEntries")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(1000);
    const activeDaySet = new Set(
      memoryDaily.filter((row) => row.count > 0).map((row) => row.dayKey),
    );
    const activeDays = Array.from(activeDaySet).sort((a, b) => b.localeCompare(a));
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    let streakDays = 0;
    for (let offset = 0; offset < 365; offset += 1) {
      const day = new Date(today.getTime() - offset * DAY_MS).toISOString().slice(0, 10);
      if (activeDaySet.has(day)) {
        streakDays += 1;
      } else if (offset > 0) {
        break;
      }
    }

    const topModel = [...modelRows].sort((a, b) => b.costUsdMicros - a.costUsdMicros)[0] ?? null;
    const totals = dailyRows.reduce(
      (acc, row) => {
        acc.aiRequests += row.aiRequests;
        acc.aiErrors += row.aiErrors;
        acc.aiInputTokens += row.aiInputTokens;
        acc.aiOutputTokens += row.aiOutputTokens;
        acc.aiCostUsdMicros += row.aiCostUsdMicros;
        acc.attachmentsUploaded += row.attachmentUploads;
        acc.attachmentBytesUploaded += row.attachmentBytesUploaded;
        acc.memoriesCreated += row.memoryCreates;
        acc.diaryEntries += row.diaryEntries;
        acc.chatMessages += row.chatMessages;
        acc.searches += row.searches ?? 0;
        acc.deepSearches += row.deepSearches ?? 0;
        acc.searchCacheHits += row.searchCacheHits ?? 0;
        acc.vectorSearches += row.vectorSearches ?? 0;
        acc.fullTextSearches += row.fullTextSearches ?? 0;
        acc.keywordSearches += row.keywordSearches ?? 0;
        acc.searchResults += row.searchResults ?? 0;
        acc.searchLatencyMs += row.searchLatencyMs ?? 0;
        return acc;
      },
      {
        aiRequests: 0,
        aiErrors: 0,
        aiInputTokens: 0,
        aiOutputTokens: 0,
        aiCostUsdMicros: 0,
        attachmentsUploaded: 0,
        attachmentBytesUploaded: 0,
        memoriesCreated: 0,
        diaryEntries: 0,
        chatMessages: 0,
        searches: 0,
        deepSearches: 0,
        searchCacheHits: 0,
        vectorSearches: 0,
        fullTextSearches: 0,
        keywordSearches: 0,
        searchResults: 0,
        searchLatencyMs: 0,
      },
    );

    return {
      trackingStartedAt: summary?.trackingStartedAt ?? null,
      lastActivityAt: summary?.lastActivityAt ?? null,
      totals: {
        totalMemories: memoryStats?.totalMemories ?? 0,
        totalReminders: memoryStats?.totalReminders ?? 0,
        totalDiaryEntries: diaryEntries.length,
        totalAiRequests: summary?.totalAiRequests ?? 0,
        totalAiCostUsdMicros: summary?.totalAiCostUsdMicros ?? 0,
        liveStorageBytes: summary?.liveStorageBytes ?? 0,
        liveStorageCount: summary?.liveStorageCount ?? 0,
        liveImageCount: summary?.liveImageCount ?? 0,
        liveDocumentCount: summary?.liveDocumentCount ?? 0,
        totalSearches: summary?.totalSearches ?? 0,
        totalDeepSearches: summary?.totalDeepSearches ?? 0,
        totalSearchCacheHits: summary?.totalSearchCacheHits ?? 0,
        totalVectorSearches: summary?.totalVectorSearches ?? 0,
        totalFullTextSearches: summary?.totalFullTextSearches ?? 0,
      },
      rangeTotals: {
        ...totals,
        failureRate: totals.aiRequests > 0 ? totals.aiErrors / totals.aiRequests : 0,
        searchCacheHitRate: totals.searches > 0 ? totals.searchCacheHits / totals.searches : 0,
        avgSearchLatencyMs: totals.searches > 0 ? totals.searchLatencyMs / totals.searches : 0,
        avgSearchResults: totals.searches > 0 ? totals.searchResults / totals.searches : 0,
      },
      consistency: {
        streakDays,
        activeDays: activeDays.length,
      },
      topModel: topModel
        ? {
            provider: topModel.provider,
            model: topModel.model,
            operation: topModel.operation,
            feature: topModel.feature,
            requests: topModel.requests,
            costUsdMicros: topModel.costUsdMicros,
            totalTokens: topModel.totalTokens,
          }
        : null,
      timeline: dailyRows.map((row) => ({
        dayKey: row.dayKey,
        memoryCreates: row.memoryCreates,
        diaryEntries: row.diaryEntries,
        chatMessages: row.chatMessages,
        aiRequests: row.aiRequests,
        searches: row.searches ?? 0,
        vectorSearches: row.vectorSearches ?? 0,
        aiCostUsdMicros: row.aiCostUsdMicros,
        attachmentBytesUploaded: row.attachmentBytesUploaded,
      })),
    };
  },
});

export const aiBreakdown = query({
  args: {
    token: v.string(),
    range: rangeValidator,
  },
  handler: async (ctx, args) => {
    const { userId } = await resolveUser(ctx, args.token);
    const range = args.range ?? "30d";
    const rows = filterDailyByRange(
      await ctx.db
        .query("userAnalyticsModelDaily")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .order("desc")
        .take(Math.max(getRangeDays(range) * 10, 60)),
      range,
    );
    const grouped = new Map<
      string,
      {
        provider: string;
        model: string;
        operation: string;
        feature: string;
        requests: number;
        errors: number;
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
        audioSeconds: number;
        costUsdMicros: number;
      }
    >();

    for (const row of rows) {
      const key = [row.provider, row.model, row.operation, row.feature].join("|");
      const current = grouped.get(key) ?? {
        provider: row.provider,
        model: row.model,
        operation: row.operation,
        feature: row.feature,
        requests: 0,
        errors: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        audioSeconds: 0,
        costUsdMicros: 0,
      };
      current.requests += row.requests;
      current.errors += row.errors;
      current.inputTokens += row.inputTokens;
      current.outputTokens += row.outputTokens;
      current.totalTokens += row.totalTokens;
      current.audioSeconds += row.audioSeconds;
      current.costUsdMicros += row.costUsdMicros;
      grouped.set(key, current);
    }

    return Array.from(grouped.values()).sort(
      (a, b) => b.costUsdMicros - a.costUsdMicros || b.requests - a.requests,
    );
  },
});

export const recentEvents = query({
  args: {
    token: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const { userId } = await resolveUser(ctx, args.token);
    return await ctx.db
      .query("userAiUsageEvents")
      .withIndex("by_user_occurred_at", (q) => q.eq("userId", userId))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const activityTimeline = query({
  args: {
    token: v.string(),
    range: rangeValidator,
  },
  handler: async (ctx, args) => {
    const { userId } = await resolveUser(ctx, args.token);
    const range = args.range ?? "30d";
    const rows = filterDailyByRange(
      await ctx.db
        .query("userAnalyticsDaily")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .order("desc")
        .take(getRangeDays(range)),
      range,
    ).reverse();
    return rows;
  },
});

export const adminOverview = query({
  args: {
    range: rangeValidator,
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const range = args.range ?? "30d";
    const rows = filterDailyByRange(
      await ctx.db.query("userAnalyticsDaily").order("desc").take(5000),
      range,
    );
    const subjects = new Set(rows.map((row) => row.analyticsSubjectId).filter(Boolean));
    return rows.reduce(
      (acc, row) => {
        acc.subjects = subjects.size;
        acc.aiRequests += row.aiRequests;
        acc.aiCostUsdMicros += row.aiCostUsdMicros;
        acc.searches += row.searches ?? 0;
        acc.deepSearches += row.deepSearches ?? 0;
        acc.vectorSearches += row.vectorSearches ?? 0;
        acc.storageUploadsBytes += row.attachmentBytesUploaded;
        return acc;
      },
      {
        subjects: subjects.size,
        aiRequests: 0,
        aiCostUsdMicros: 0,
        searches: 0,
        deepSearches: 0,
        vectorSearches: 0,
        storageUploadsBytes: 0,
      },
    );
  },
});

export const adminRecentEvents = query({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return await ctx.db
      .query("userAiUsageEvents")
      .withIndex("by_occurred_at")
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const cleanupOldAiUsageEvents = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - RAW_EVENT_RETENTION_MS;
    const stale = await ctx.db
      .query("userAiUsageEvents")
      .withIndex("by_occurred_at", (q) => q.lt("occurredAt", cutoff))
      .take(200);
    for (const row of stale) {
      await ctx.db.delete(row._id);
    }
    return stale.length;
  },
});
