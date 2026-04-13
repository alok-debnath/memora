import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { requireAdmin, resolveUser } from "./lib/withAuth";
import { aiBilledToValidator } from "./lib/validators";

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
const spendSourceValidator = v.optional(
  v.union(v.literal("combined"), v.literal("memora"), v.literal("user_byok")),
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
type AiVisibility = "user_visible" | "background";
type AiBilledTo = "memora" | "user_byok";

const searchFeatureValidator = v.union(
  v.literal("memory_search"),
  v.literal("memory_chat"),
  v.literal("deep_search"),
  v.literal("conflict_detection"),
);

function getEmptyAiSplitTotals() {
  return {
    requests: 0,
    inputTokens: 0,
    outputTokens: 0,
    audioSeconds: 0,
    costUsdMicros: 0,
  };
}

function getBilledToSplit(row: {
  billedTo?: AiBilledTo;
  credentialSource?: "platform" | "user_byok";
  billingOwner?: "platform" | "user";
}): AiBilledTo {
  if (row.billedTo) {
    return row.billedTo;
  }
  return row.credentialSource === "user_byok" || row.billingOwner === "user"
    ? "user_byok"
    : "memora";
}

function getRequestedTotals(args: {
  memoraRequests?: number;
  memoraInputTokens?: number;
  memoraOutputTokens?: number;
  memoraAudioSeconds?: number;
  memoraCostUsdMicros?: number;
  byokRequests?: number;
  byokInputTokens?: number;
  byokOutputTokens?: number;
  byokAudioSeconds?: number;
  byokCostUsdMicros?: number;
  combinedRequests: number;
  combinedInputTokens: number;
  combinedOutputTokens: number;
  combinedAudioSeconds: number;
  combinedCostUsdMicros: number;
  spendSource?: "combined" | "memora" | "user_byok";
}) {
  if (args.spendSource === "memora") {
    return {
      requests: args.memoraRequests ?? 0,
      inputTokens: args.memoraInputTokens ?? 0,
      outputTokens: args.memoraOutputTokens ?? 0,
      audioSeconds: args.memoraAudioSeconds ?? 0,
      costUsdMicros: args.memoraCostUsdMicros ?? 0,
    };
  }
  if (args.spendSource === "user_byok") {
    return {
      requests: args.byokRequests ?? 0,
      inputTokens: args.byokInputTokens ?? 0,
      outputTokens: args.byokOutputTokens ?? 0,
      audioSeconds: args.byokAudioSeconds ?? 0,
      costUsdMicros: args.byokCostUsdMicros ?? 0,
    };
  }
  return {
    requests: args.combinedRequests,
    inputTokens: args.combinedInputTokens,
    outputTokens: args.combinedOutputTokens,
    audioSeconds: args.combinedAudioSeconds,
    costUsdMicros: args.combinedCostUsdMicros,
  };
}

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
    totalAiMemoraRequests: 0,
    totalAiMemoraInputTokens: 0,
    totalAiMemoraOutputTokens: 0,
    totalAiMemoraAudioSeconds: 0,
    totalAiMemoraCostUsdMicros: 0,
    totalAiByokRequests: 0,
    totalAiByokInputTokens: 0,
    totalAiByokOutputTokens: 0,
    totalAiByokAudioSeconds: 0,
    totalAiByokCostUsdMicros: 0,
    totalAiActions: 0,
    totalBackgroundAiOperations: 0,
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
    aiMemoraRequests: 0,
    aiMemoraInputTokens: 0,
    aiMemoraOutputTokens: 0,
    aiMemoraAudioSeconds: 0,
    aiMemoraCostUsdMicros: 0,
    aiByokRequests: 0,
    aiByokInputTokens: 0,
    aiByokOutputTokens: 0,
    aiByokAudioSeconds: 0,
    aiByokCostUsdMicros: 0,
    aiActions: 0,
    backgroundAiOperations: 0,
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
    stage?: string;
    visibility?: AiVisibility;
    credentialSource?: "platform" | "user_byok";
    billingOwner?: "platform" | "user";
    billedTo?: AiBilledTo;
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
    rows.find(
      (row) =>
        row.operation === args.operation &&
        row.feature === args.feature &&
        row.stage === args.stage &&
        row.visibility === args.visibility &&
        row.credentialSource === args.credentialSource &&
        row.billingOwner === args.billingOwner &&
        getBilledToSplit(row) === (args.billedTo ?? "memora"),
    ) ?? null;
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
    stage: args.stage,
    visibility: args.visibility,
    credentialSource: args.credentialSource,
    billingOwner: args.billingOwner,
    billedTo: args.billedTo,
    requests: 0,
    errors: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    audioSeconds: 0,
    costUsdMicros: 0,
    memoraRequests: 0,
    memoraInputTokens: 0,
    memoraOutputTokens: 0,
    memoraAudioSeconds: 0,
    memoraCostUsdMicros: 0,
    byokRequests: 0,
    byokInputTokens: 0,
    byokOutputTokens: 0,
    byokAudioSeconds: 0,
    byokCostUsdMicros: 0,
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
  handler: async (_ctx, _args) => {
    // Attachments are stored in Google Drive, not Memora-managed storage.
    // Keep the mutation as a no-op to avoid breaking existing call sites while
    // stopping misleading "live storage" analytics.
    return null;
  },
});

export const recordSearchUsage = internalMutation({
  args: {
    userId: v.id("users"),
    chatTurnId: v.optional(v.id("chatMessages")),
    chatMessageId: v.optional(v.id("chatMessages")),
    conversationId: v.optional(v.string()),
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
      chatTurnId: args.chatTurnId,
      chatMessageId: args.chatMessageId,
      conversationId: args.conversationId,
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
    chatTurnId: v.optional(v.id("chatMessages")),
    chatMessageId: v.optional(v.id("chatMessages")),
    conversationId: v.optional(v.string()),
    occurredAt: v.optional(v.number()),
    provider: v.string(),
    model: v.string(),
    operation: v.string(),
    feature: v.string(),
    stage: v.optional(v.string()),
    visibility: v.optional(v.union(v.literal("user_visible"), v.literal("background"))),
    credentialSource: v.optional(v.union(v.literal("platform"), v.literal("user_byok"))),
    billingOwner: v.optional(v.union(v.literal("platform"), v.literal("user"))),
    billedTo: v.optional(aiBilledToValidator),
    routingReason: v.optional(v.string()),
    status: v.union(v.literal("success"), v.literal("error")),
    latencyMs: v.optional(v.number()),
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
    totalTokens: v.optional(v.number()),
    audioSeconds: v.optional(v.number()),
    costUsdMicros: v.optional(v.number()),
    costAvailability: v.union(v.literal("estimated"), v.literal("exact"), v.literal("unavailable")),
    priceDisplayMode: v.optional(
      v.union(v.literal("estimated"), v.literal("exact"), v.literal("unavailable")),
    ),
    pricingOperation: v.optional(
      v.union(
        v.literal("chat_completion"),
        v.literal("embedding"),
        v.literal("transcription"),
        v.literal("image_generation"),
      ),
    ),
    pricingVersion: v.optional(v.string()),
    pricingReason: v.optional(v.string()),
    metadata: v.optional(v.record(v.string(), v.string())),
  },
  handler: async (ctx, args) => {
    const now = args.occurredAt ?? Date.now();
    const dayKey = getDayKey(now);
    const analyticsSubjectId = await ensureAnalyticsSubjectId(ctx, args.userId);
    const summary = await ensureSummary(ctx, args.userId);
    const daily = await getOrCreateDaily(ctx, args.userId, dayKey);
    const visibility: AiVisibility = args.visibility ?? "background";
    const billedTo = args.billedTo ?? getBilledToSplit(args);
    const modelDaily = await getOrCreateModelDaily(ctx, {
      userId: args.userId,
      dayKey,
      provider: args.provider,
      model: args.model,
      operation: args.operation,
      feature: args.feature,
      stage: args.stage,
      visibility,
      credentialSource: args.credentialSource,
      billingOwner: args.billingOwner,
      billedTo,
    });

    const inputTokens = Math.max(0, Math.floor(args.inputTokens ?? 0));
    const outputTokens = Math.max(0, Math.floor(args.outputTokens ?? 0));
    const totalTokens = Math.max(0, Math.floor(args.totalTokens ?? inputTokens + outputTokens));
    const audioSeconds = Math.max(0, Math.round(args.audioSeconds ?? 0));
    const costUsdMicros = Math.max(0, Math.floor(args.costUsdMicros ?? 0));

    await ctx.db.insert("userAiUsageEvents", {
      userId: args.userId,
      analyticsSubjectId,
      chatTurnId: args.chatTurnId,
      chatMessageId: args.chatMessageId,
      conversationId: args.conversationId,
      occurredAt: now,
      dayKey,
      provider: args.provider,
      model: args.model,
      operation: args.operation,
      feature: args.feature,
      stage: args.stage,
      visibility,
      credentialSource: args.credentialSource,
      billingOwner: args.billingOwner,
      billedTo,
      routingReason: args.routingReason,
      status: args.status,
      latencyMs: args.latencyMs,
      inputTokens: inputTokens || undefined,
      outputTokens: outputTokens || undefined,
      totalTokens: totalTokens || undefined,
      audioSeconds: audioSeconds || undefined,
      costUsdMicros: costUsdMicros || undefined,
      costAvailability: args.costAvailability,
      priceDisplayMode: args.priceDisplayMode,
      pricingOperation: args.pricingOperation,
      pricingVersion: args.pricingVersion,
      pricingReason: args.pricingReason,
      metadata: args.metadata,
    });

    const isMemora = billedTo === "memora";
    const summaryMemoraRequests = summary.totalAiMemoraRequests ?? 0;
    const summaryMemoraInputTokens = summary.totalAiMemoraInputTokens ?? 0;
    const summaryMemoraOutputTokens = summary.totalAiMemoraOutputTokens ?? 0;
    const summaryMemoraAudioSeconds = summary.totalAiMemoraAudioSeconds ?? 0;
    const summaryMemoraCostUsdMicros = summary.totalAiMemoraCostUsdMicros ?? 0;
    const summaryByokRequests = summary.totalAiByokRequests ?? 0;
    const summaryByokInputTokens = summary.totalAiByokInputTokens ?? 0;
    const summaryByokOutputTokens = summary.totalAiByokOutputTokens ?? 0;
    const summaryByokAudioSeconds = summary.totalAiByokAudioSeconds ?? 0;
    const summaryByokCostUsdMicros = summary.totalAiByokCostUsdMicros ?? 0;

    await ctx.db.patch(summary._id, {
      analyticsSubjectId,
      totalAiRequests: summary.totalAiRequests + 1,
      totalAiErrors: summary.totalAiErrors + (args.status === "error" ? 1 : 0),
      totalAiInputTokens: summary.totalAiInputTokens + inputTokens,
      totalAiOutputTokens: summary.totalAiOutputTokens + outputTokens,
      totalAiAudioSeconds: summary.totalAiAudioSeconds + audioSeconds,
      totalAiCostUsdMicros: summary.totalAiCostUsdMicros + costUsdMicros,
      totalAiMemoraRequests: summaryMemoraRequests + (isMemora ? 1 : 0),
      totalAiMemoraInputTokens: summaryMemoraInputTokens + (isMemora ? inputTokens : 0),
      totalAiMemoraOutputTokens: summaryMemoraOutputTokens + (isMemora ? outputTokens : 0),
      totalAiMemoraAudioSeconds: summaryMemoraAudioSeconds + (isMemora ? audioSeconds : 0),
      totalAiMemoraCostUsdMicros: summaryMemoraCostUsdMicros + (isMemora ? costUsdMicros : 0),
      totalAiByokRequests: summaryByokRequests + (!isMemora ? 1 : 0),
      totalAiByokInputTokens: summaryByokInputTokens + (!isMemora ? inputTokens : 0),
      totalAiByokOutputTokens: summaryByokOutputTokens + (!isMemora ? outputTokens : 0),
      totalAiByokAudioSeconds: summaryByokAudioSeconds + (!isMemora ? audioSeconds : 0),
      totalAiByokCostUsdMicros: summaryByokCostUsdMicros + (!isMemora ? costUsdMicros : 0),
      totalAiActions: (summary.totalAiActions ?? 0) + (visibility === "user_visible" ? 1 : 0),
      totalBackgroundAiOperations:
        (summary.totalBackgroundAiOperations ?? 0) + (visibility === "background" ? 1 : 0),
      lastActivityAt: now,
      updatedAt: now,
    });

    const dailyMemoraRequests = daily.aiMemoraRequests ?? 0;
    const dailyMemoraInputTokens = daily.aiMemoraInputTokens ?? 0;
    const dailyMemoraOutputTokens = daily.aiMemoraOutputTokens ?? 0;
    const dailyMemoraAudioSeconds = daily.aiMemoraAudioSeconds ?? 0;
    const dailyMemoraCostUsdMicros = daily.aiMemoraCostUsdMicros ?? 0;
    const dailyByokRequests = daily.aiByokRequests ?? 0;
    const dailyByokInputTokens = daily.aiByokInputTokens ?? 0;
    const dailyByokOutputTokens = daily.aiByokOutputTokens ?? 0;
    const dailyByokAudioSeconds = daily.aiByokAudioSeconds ?? 0;
    const dailyByokCostUsdMicros = daily.aiByokCostUsdMicros ?? 0;

    await ctx.db.patch(daily._id, {
      analyticsSubjectId,
      aiRequests: daily.aiRequests + 1,
      aiErrors: daily.aiErrors + (args.status === "error" ? 1 : 0),
      aiInputTokens: daily.aiInputTokens + inputTokens,
      aiOutputTokens: daily.aiOutputTokens + outputTokens,
      aiAudioSeconds: daily.aiAudioSeconds + audioSeconds,
      aiCostUsdMicros: daily.aiCostUsdMicros + costUsdMicros,
      aiMemoraRequests: dailyMemoraRequests + (isMemora ? 1 : 0),
      aiMemoraInputTokens: dailyMemoraInputTokens + (isMemora ? inputTokens : 0),
      aiMemoraOutputTokens: dailyMemoraOutputTokens + (isMemora ? outputTokens : 0),
      aiMemoraAudioSeconds: dailyMemoraAudioSeconds + (isMemora ? audioSeconds : 0),
      aiMemoraCostUsdMicros: dailyMemoraCostUsdMicros + (isMemora ? costUsdMicros : 0),
      aiByokRequests: dailyByokRequests + (!isMemora ? 1 : 0),
      aiByokInputTokens: dailyByokInputTokens + (!isMemora ? inputTokens : 0),
      aiByokOutputTokens: dailyByokOutputTokens + (!isMemora ? outputTokens : 0),
      aiByokAudioSeconds: dailyByokAudioSeconds + (!isMemora ? audioSeconds : 0),
      aiByokCostUsdMicros: dailyByokCostUsdMicros + (!isMemora ? costUsdMicros : 0),
      aiActions: (daily.aiActions ?? 0) + (visibility === "user_visible" ? 1 : 0),
      backgroundAiOperations:
        (daily.backgroundAiOperations ?? 0) + (visibility === "background" ? 1 : 0),
      updatedAt: now,
    });

    await ctx.db.patch(modelDaily._id, {
      analyticsSubjectId,
      stage: args.stage,
      visibility,
      credentialSource: args.credentialSource,
      billingOwner: args.billingOwner,
      billedTo,
      requests: modelDaily.requests + 1,
      errors: modelDaily.errors + (args.status === "error" ? 1 : 0),
      inputTokens: modelDaily.inputTokens + inputTokens,
      outputTokens: modelDaily.outputTokens + outputTokens,
      totalTokens: modelDaily.totalTokens + totalTokens,
      audioSeconds: modelDaily.audioSeconds + audioSeconds,
      costUsdMicros: modelDaily.costUsdMicros + costUsdMicros,
      memoraRequests: (modelDaily.memoraRequests ?? 0) + (isMemora ? 1 : 0),
      memoraInputTokens: (modelDaily.memoraInputTokens ?? 0) + (isMemora ? inputTokens : 0),
      memoraOutputTokens: (modelDaily.memoraOutputTokens ?? 0) + (isMemora ? outputTokens : 0),
      memoraAudioSeconds: (modelDaily.memoraAudioSeconds ?? 0) + (isMemora ? audioSeconds : 0),
      memoraCostUsdMicros: (modelDaily.memoraCostUsdMicros ?? 0) + (isMemora ? costUsdMicros : 0),
      byokRequests: (modelDaily.byokRequests ?? 0) + (!isMemora ? 1 : 0),
      byokInputTokens: (modelDaily.byokInputTokens ?? 0) + (!isMemora ? inputTokens : 0),
      byokOutputTokens: (modelDaily.byokOutputTokens ?? 0) + (!isMemora ? outputTokens : 0),
      byokAudioSeconds: (modelDaily.byokAudioSeconds ?? 0) + (!isMemora ? audioSeconds : 0),
      byokCostUsdMicros: (modelDaily.byokCostUsdMicros ?? 0) + (!isMemora ? costUsdMicros : 0),
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
    spendSource: spendSourceValidator,
  },
  handler: async (ctx, args) => {
    const { userId } = await resolveUser(ctx, args.token);
    const range = args.range ?? "30d";
    const spendSource = args.spendSource ?? "combined";
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

    const filteredModelRows = modelRows.filter(
      (row) => spendSource === "combined" || getBilledToSplit(row) === spendSource,
    );
    const topModel =
      [...filteredModelRows].sort((a, b) => b.costUsdMicros - a.costUsdMicros)[0] ?? null;
    const totals = dailyRows.reduce(
      (acc, row) => {
        const split = getRequestedTotals({
          memoraRequests: row.aiMemoraRequests,
          memoraInputTokens: row.aiMemoraInputTokens,
          memoraOutputTokens: row.aiMemoraOutputTokens,
          memoraAudioSeconds: row.aiMemoraAudioSeconds,
          memoraCostUsdMicros: row.aiMemoraCostUsdMicros,
          byokRequests: row.aiByokRequests,
          byokInputTokens: row.aiByokInputTokens,
          byokOutputTokens: row.aiByokOutputTokens,
          byokAudioSeconds: row.aiByokAudioSeconds,
          byokCostUsdMicros: row.aiByokCostUsdMicros,
          combinedRequests: row.aiRequests,
          combinedInputTokens: row.aiInputTokens,
          combinedOutputTokens: row.aiOutputTokens,
          combinedAudioSeconds: row.aiAudioSeconds,
          combinedCostUsdMicros: row.aiCostUsdMicros,
          spendSource,
        });
        acc.aiRequests += split.requests;
        acc.aiActions += row.aiActions ?? 0;
        acc.backgroundAiOperations += row.backgroundAiOperations ?? 0;
        acc.aiErrors += row.aiErrors;
        acc.aiInputTokens += split.inputTokens;
        acc.aiOutputTokens += split.outputTokens;
        acc.aiAudioSeconds += split.audioSeconds;
        acc.aiCostUsdMicros += split.costUsdMicros;
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
        aiActions: 0,
        backgroundAiOperations: 0,
        aiErrors: 0,
        aiInputTokens: 0,
        aiOutputTokens: 0,
        aiAudioSeconds: 0,
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
      spendSource,
      totals: {
        totalMemories: memoryStats?.totalMemories ?? 0,
        totalReminders: memoryStats?.totalReminders ?? 0,
        totalDiaryEntries: diaryEntries.length,
        totalAiRequests: summary?.totalAiRequests ?? 0,
        totalAiMemoraRequests: summary?.totalAiMemoraRequests ?? 0,
        totalAiByokRequests: summary?.totalAiByokRequests ?? 0,
        totalAiActions: summary?.totalAiActions ?? 0,
        totalBackgroundAiOperations: summary?.totalBackgroundAiOperations ?? 0,
        totalAiCostUsdMicros: summary?.totalAiCostUsdMicros ?? 0,
        totalAiMemoraCostUsdMicros: summary?.totalAiMemoraCostUsdMicros ?? 0,
        totalAiByokCostUsdMicros: summary?.totalAiByokCostUsdMicros ?? 0,
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
            stage: topModel.stage ?? null,
            visibility: topModel.visibility ?? "background",
            billedTo: getBilledToSplit(topModel),
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
        aiRequests:
          spendSource === "memora"
            ? (row.aiMemoraRequests ?? 0)
            : spendSource === "user_byok"
              ? (row.aiByokRequests ?? 0)
              : row.aiRequests,
        aiActions: row.aiActions ?? 0,
        backgroundAiOperations: row.backgroundAiOperations ?? 0,
        searches: row.searches ?? 0,
        vectorSearches: row.vectorSearches ?? 0,
        aiCostUsdMicros:
          spendSource === "memora"
            ? (row.aiMemoraCostUsdMicros ?? 0)
            : spendSource === "user_byok"
              ? (row.aiByokCostUsdMicros ?? 0)
              : row.aiCostUsdMicros,
        attachmentBytesUploaded: row.attachmentBytesUploaded,
      })),
    };
  },
});

export const aiBreakdown = query({
  args: {
    token: v.string(),
    range: rangeValidator,
    spendSource: spendSourceValidator,
  },
  handler: async (ctx, args) => {
    const { userId } = await resolveUser(ctx, args.token);
    const range = args.range ?? "30d";
    const spendSource = args.spendSource ?? "combined";
    const rows = filterDailyByRange(
      await ctx.db
        .query("userAnalyticsModelDaily")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .order("desc")
        .take(Math.max(getRangeDays(range) * 10, 60)),
      range,
    ).filter((row) => spendSource === "combined" || getBilledToSplit(row) === spendSource);
    const grouped = new Map<
      string,
      {
        provider: string;
        model: string;
        operation: string;
        feature: string;
        stage?: string;
        visibility: AiVisibility;
        billedTo: AiBilledTo;
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
      const key = [
        row.provider,
        row.model,
        row.operation,
        row.feature,
        row.stage ?? "",
        row.visibility ?? "background",
        getBilledToSplit(row),
      ].join("|");
      const current = grouped.get(key) ?? {
        provider: row.provider,
        model: row.model,
        operation: row.operation,
        feature: row.feature,
        stage: row.stage,
        visibility: row.visibility ?? "background",
        billedTo: getBilledToSplit(row),
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

export const aiFeatureBreakdown = query({
  args: {
    token: v.string(),
    range: rangeValidator,
    spendSource: spendSourceValidator,
  },
  handler: async (ctx, args) => {
    const { userId } = await resolveUser(ctx, args.token);
    const range = args.range ?? "30d";
    const spendSource = args.spendSource ?? "combined";
    const rows = filterDailyByRange(
      await ctx.db
        .query("userAnalyticsModelDaily")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .order("desc")
        .take(Math.max(getRangeDays(range) * 10, 60)),
      range,
    ).filter((row) => spendSource === "combined" || getBilledToSplit(row) === spendSource);
    const grouped = new Map<
      string,
      {
        feature: string;
        stage: string;
        visibility: AiVisibility;
        billedTo: AiBilledTo;
        requests: number;
        errors: number;
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
        costUsdMicros: number;
        latencyMs?: number;
      }
    >();

    for (const row of rows) {
      const stage = row.stage ?? row.operation;
      const visibility = row.visibility ?? "background";
      const billedTo = getBilledToSplit(row);
      const key = [row.feature, stage, visibility, billedTo].join("|");
      const current = grouped.get(key) ?? {
        feature: row.feature,
        stage,
        visibility,
        billedTo,
        requests: 0,
        errors: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        costUsdMicros: 0,
      };
      current.requests += row.requests;
      current.errors += row.errors;
      current.inputTokens += row.inputTokens;
      current.outputTokens += row.outputTokens;
      current.totalTokens += row.totalTokens;
      current.costUsdMicros += row.costUsdMicros;
      grouped.set(key, current);
    }

    return Array.from(grouped.values()).sort(
      (a, b) =>
        Number(b.visibility === "user_visible") - Number(a.visibility === "user_visible") ||
        b.costUsdMicros - a.costUsdMicros ||
        b.requests - a.requests,
    );
  },
});

export const recentEvents = query({
  args: {
    token: v.string(),
    range: rangeValidator,
    spendSource: spendSourceValidator,
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const { userId } = await resolveUser(ctx, args.token);
    const range = args.range ?? "30d";
    const spendSource = args.spendSource ?? "combined";
    const result = await ctx.db
      .query("userAiUsageEvents")
      .withIndex("by_user_occurred_at", (q) => q.eq("userId", userId))
      .order("desc")
      .paginate(args.paginationOpts);
    return {
      ...result,
      page: result.page.filter(
        (row) =>
          row.dayKey >= getDayKey(Date.now() - (getRangeDays(range) - 1) * DAY_MS) &&
          (spendSource === "combined" || getBilledToSplit(row) === spendSource),
      ),
    };
  },
});

export const chatTurnBreakdown = query({
  args: {
    token: v.string(),
    chatTurnId: v.id("chatMessages"),
  },
  handler: async (ctx, args) => {
    const { userId } = await resolveUser(ctx, args.token);
    const rows = await ctx.db
      .query("userAiUsageEvents")
      .withIndex("by_user_chat_turn_occurred_at", (q) =>
        q.eq("userId", userId).eq("chatTurnId", args.chatTurnId),
      )
      .order("asc")
      .take(200);

    const relevantRows = rows.filter((row) => row.chatTurnId === args.chatTurnId);
    const featureGroups = new Map<
      string,
      {
        feature: string;
        stage: string;
        visibility: AiVisibility;
        billedTo: AiBilledTo;
        providers: string[];
        models: string[];
        requests: number;
        errors: number;
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
        costUsdMicros: number;
        latencyMs: number;
      }
    >();
    const modelGroups = new Map<
      string,
      {
        provider: string;
        model: string;
        operation: string;
        feature: string;
        stage?: string;
        visibility: AiVisibility;
        billedTo: AiBilledTo;
        requests: number;
        errors: number;
        totalTokens: number;
        costUsdMicros: number;
        latencyMs: number;
      }
    >();

    let aiRequests = 0;
    let aiActions = 0;
    let backgroundAiOperations = 0;
    let failures = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let totalTokens = 0;
    let costUsdMicros = 0;
    let totalLatencyMs = 0;
    let searches = 0;
    let deepSearches = 0;
    let vectorSearches = 0;
    let fullTextSearches = 0;
    let keywordSearches = 0;
    let searchCacheHits = 0;
    let totalSearchResults = 0;
    let totalSearchLatencyMs = 0;

    for (const row of relevantRows) {
      const isSearch = row.provider === "memora" && row.operation === "search";
      const visibility = row.visibility ?? "background";
      const stage = row.stage ?? row.operation;
      const billedTo = getBilledToSplit(row);
      const rowLatency = row.latencyMs ?? 0;
      const rowTotalTokens = row.totalTokens ?? 0;
      const rowCost = row.costUsdMicros ?? 0;

      if (isSearch) {
        searches += 1;
        deepSearches += row.feature === "deep_search" ? 1 : 0;
        vectorSearches += row.metadata?.usedVector === "true" ? 1 : 0;
        fullTextSearches += row.metadata?.usedFullText === "true" ? 1 : 0;
        keywordSearches += row.metadata?.usedKeyword === "true" ? 1 : 0;
        searchCacheHits += row.metadata?.cacheHit === "true" ? 1 : 0;
        totalSearchResults += Number(row.metadata?.resultCount ?? "0") || 0;
        totalSearchLatencyMs += rowLatency;
      } else {
        aiRequests += 1;
        aiActions += visibility === "user_visible" ? 1 : 0;
        backgroundAiOperations += visibility === "background" ? 1 : 0;
        failures += row.status === "error" ? 1 : 0;
        inputTokens += row.inputTokens ?? 0;
        outputTokens += row.outputTokens ?? 0;
        totalTokens += rowTotalTokens;
        costUsdMicros += rowCost;
        totalLatencyMs += rowLatency;
      }

      const featureKey = [row.feature, stage, visibility, billedTo].join("|");
      const featureCurrent = featureGroups.get(featureKey) ?? {
        feature: row.feature,
        stage,
        visibility,
        billedTo,
        providers: [],
        models: [],
        requests: 0,
        errors: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        costUsdMicros: 0,
        latencyMs: 0,
      };
      if (!featureCurrent.providers.includes(row.provider)) {
        featureCurrent.providers.push(row.provider);
      }
      if (!featureCurrent.models.includes(row.model)) {
        featureCurrent.models.push(row.model);
      }
      featureCurrent.requests += 1;
      featureCurrent.errors += row.status === "error" ? 1 : 0;
      featureCurrent.inputTokens += row.inputTokens ?? 0;
      featureCurrent.outputTokens += row.outputTokens ?? 0;
      featureCurrent.totalTokens += rowTotalTokens;
      featureCurrent.costUsdMicros += rowCost;
      featureCurrent.latencyMs += rowLatency;
      featureGroups.set(featureKey, featureCurrent);

      const modelKey = [
        row.provider,
        row.model,
        row.operation,
        row.feature,
        stage,
        visibility,
        billedTo,
      ].join("|");
      const modelCurrent = modelGroups.get(modelKey) ?? {
        provider: row.provider,
        model: row.model,
        operation: row.operation,
        feature: row.feature,
        stage,
        visibility,
        billedTo,
        requests: 0,
        errors: 0,
        totalTokens: 0,
        costUsdMicros: 0,
        latencyMs: 0,
      };
      modelCurrent.requests += 1;
      modelCurrent.errors += row.status === "error" ? 1 : 0;
      modelCurrent.totalTokens += rowTotalTokens;
      modelCurrent.costUsdMicros += rowCost;
      modelCurrent.latencyMs += rowLatency;
      modelGroups.set(modelKey, modelCurrent);
    }

    return {
      chatTurnId: args.chatTurnId,
      overview: {
        aiRequests,
        aiActions,
        backgroundAiOperations,
        failures,
        inputTokens,
        outputTokens,
        totalTokens,
        costUsdMicros,
        totalLatencyMs,
        operationCount: relevantRows.length,
      },
      search: {
        searches,
        deepSearches,
        vectorSearches,
        fullTextSearches,
        keywordSearches,
        searchCacheHits,
        avgResults: searches > 0 ? totalSearchResults / searches : 0,
        avgLatencyMs: searches > 0 ? totalSearchLatencyMs / searches : 0,
      },
      features: Array.from(featureGroups.values())
        .map((item) => ({
          ...item,
          avgLatencyMs: item.requests > 0 ? item.latencyMs / item.requests : 0,
          fallback: item.providers.length > 1,
        }))
        .sort(
          (a, b) =>
            Number(b.visibility === "user_visible") - Number(a.visibility === "user_visible") ||
            b.costUsdMicros - a.costUsdMicros ||
            b.requests - a.requests,
        ),
      models: Array.from(modelGroups.values())
        .map((item) => ({
          ...item,
          avgLatencyMs: item.requests > 0 ? item.latencyMs / item.requests : 0,
        }))
        .sort((a, b) => b.costUsdMicros - a.costUsdMicros || b.requests - a.requests),
      timeline: relevantRows.map((row) => ({
        _id: row._id,
        occurredAt: row.occurredAt,
        provider: row.provider,
        model: row.model,
        operation: row.operation,
        feature: row.feature,
        stage: row.stage ?? row.operation,
        visibility: row.visibility ?? "background",
        billedTo: getBilledToSplit(row),
        status: row.status,
        latencyMs: row.latencyMs ?? 0,
        totalTokens: row.totalTokens ?? 0,
        costUsdMicros: row.costUsdMicros ?? 0,
        metadata: row.metadata ?? {},
      })),
    };
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
        acc.memoraAiRequests += row.aiMemoraRequests ?? 0;
        acc.memoraAiCostUsdMicros += row.aiMemoraCostUsdMicros ?? 0;
        acc.byokAiRequests += row.aiByokRequests ?? 0;
        acc.byokAiCostUsdMicros += row.aiByokCostUsdMicros ?? 0;
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
        memoraAiRequests: 0,
        memoraAiCostUsdMicros: 0,
        byokAiRequests: 0,
        byokAiCostUsdMicros: 0,
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

export const resetAiAnalytics = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    await ctx.scheduler.runAfter(0, internal.analytics.resetAiAnalyticsBatch, {});
    return { success: true };
  },
});

export const resetAiAnalyticsBatch = internalMutation({
  args: {},
  handler: async (ctx) => {
    let processed = 0;

    const usageEvents = await ctx.db.query("userAiUsageEvents").take(200);
    for (const row of usageEvents) {
      await ctx.db.delete(row._id);
      processed += 1;
    }
    if (usageEvents.length > 0) {
      await ctx.scheduler.runAfter(0, internal.analytics.resetAiAnalyticsBatch, {});
      return { processed, stage: "usage_events" };
    }

    const modelDailyRows = await ctx.db.query("userAnalyticsModelDaily").take(200);
    for (const row of modelDailyRows) {
      await ctx.db.delete(row._id);
      processed += 1;
    }
    if (modelDailyRows.length > 0) {
      await ctx.scheduler.runAfter(0, internal.analytics.resetAiAnalyticsBatch, {});
      return { processed, stage: "model_daily" };
    }

    const dailyRows = await ctx.db.query("userAnalyticsDaily").take(200);
    for (const row of dailyRows) {
      await ctx.db.patch(row._id, {
        aiRequests: 0,
        aiErrors: 0,
        aiInputTokens: 0,
        aiOutputTokens: 0,
        aiAudioSeconds: 0,
        aiCostUsdMicros: 0,
        aiMemoraRequests: 0,
        aiMemoraInputTokens: 0,
        aiMemoraOutputTokens: 0,
        aiMemoraAudioSeconds: 0,
        aiMemoraCostUsdMicros: 0,
        aiByokRequests: 0,
        aiByokInputTokens: 0,
        aiByokOutputTokens: 0,
        aiByokAudioSeconds: 0,
        aiByokCostUsdMicros: 0,
        aiActions: 0,
        backgroundAiOperations: 0,
        updatedAt: Date.now(),
      });
      processed += 1;
    }
    if (dailyRows.length > 0) {
      await ctx.scheduler.runAfter(0, internal.analytics.resetAiAnalyticsBatch, {});
      return { processed, stage: "daily" };
    }

    const summaryRows = await ctx.db.query("userAnalyticsSummary").take(200);
    for (const row of summaryRows) {
      await ctx.db.patch(row._id, {
        totalAiRequests: 0,
        totalAiErrors: 0,
        totalAiInputTokens: 0,
        totalAiOutputTokens: 0,
        totalAiAudioSeconds: 0,
        totalAiCostUsdMicros: 0,
        totalAiMemoraRequests: 0,
        totalAiMemoraInputTokens: 0,
        totalAiMemoraOutputTokens: 0,
        totalAiMemoraAudioSeconds: 0,
        totalAiMemoraCostUsdMicros: 0,
        totalAiByokRequests: 0,
        totalAiByokInputTokens: 0,
        totalAiByokOutputTokens: 0,
        totalAiByokAudioSeconds: 0,
        totalAiByokCostUsdMicros: 0,
        totalAiActions: 0,
        totalBackgroundAiOperations: 0,
        updatedAt: Date.now(),
      });
      processed += 1;
    }
    if (summaryRows.length > 0) {
      await ctx.scheduler.runAfter(0, internal.analytics.resetAiAnalyticsBatch, {});
      return { processed, stage: "summary" };
    }

    return { processed, stage: "done" };
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
