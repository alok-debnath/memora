import type { MutationCtx, QueryCtx } from "../../_generated/server";
import type { Doc, Id } from "../../_generated/dataModel";

export const DAY_MS = 24 * 60 * 60 * 1000;
export const RAW_EVENT_RETENTION_MS = 90 * DAY_MS;

export type SummaryDoc = Doc<"userAnalyticsSummary">;
export type DailyDoc = Doc<"userAnalyticsDaily">;
export type ModelDailyDoc = Doc<"userAnalyticsModelDaily">;
export type AiVisibility = "user_visible" | "background";
export type AiBilledTo = "memora" | "user_byok";
export type AnalyticsRange = "7d" | "30d" | "90d" | "365d" | "all";

export function getDayKey(timestamp: number) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

export function getRangeDays(range: AnalyticsRange) {
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

export function getEmptyAiSplitTotals() {
  return {
    requests: 0,
    inputTokens: 0,
    outputTokens: 0,
    audioSeconds: 0,
    costUsdMicros: 0,
  };
}

export function getBilledToSplit(row: {
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

export function getRequestedTotals(args: {
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

export async function ensureAnalyticsSubjectId(
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

export async function getSummary(
  ctx: Pick<MutationCtx, "db">,
  userId: Id<"users">,
): Promise<SummaryDoc | null> {
  return await ctx.db
    .query("userAnalyticsSummary")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
}

export async function ensureSummary(
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

export async function getOrCreateDaily(
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

export async function getOrCreateModelDaily(
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

export function clampNonNegative(value: number) {
  return Math.max(0, value);
}

export function filterDailyByRange<T extends { dayKey: string }>(rows: T[], range: AnalyticsRange) {
  if (range === "all") {
    return rows;
  }
  const cutoff = getDayKey(Date.now() - (getRangeDays(range) - 1) * DAY_MS);
  return rows.filter((row) => row.dayKey >= cutoff);
}

export async function queryDailyRowsForRange(
  ctx: QueryCtx,
  range: AnalyticsRange,
  limit: number,
): Promise<Doc<"userAnalyticsDaily">[]> {
  if (range === "all") {
    return await ctx.db.query("userAnalyticsDaily").order("desc").take(limit);
  }

  const cutoff = getDayKey(Date.now() - (getRangeDays(range) - 1) * DAY_MS);
  return await ctx.db
    .query("userAnalyticsDaily")
    .withIndex("by_day", (q) => q.gte("dayKey", cutoff))
    .order("desc")
    .take(limit);
}
