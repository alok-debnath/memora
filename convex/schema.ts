import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "./authSchema";
import {
  moodValidator,
  importanceValidator,
  lifeAreaValidator,
  recurrenceValidator,
  memoryEntryKindValidator,
  memoryScheduleValidator,
  extractedActionsValidator,
  contextTagsValidator,
  energyLevelValidator,
  priorityValidator,
  auditActionValidator,
} from "./lib/validators";

export default defineSchema({
  users: defineTable({
    tokenIdentifier: v.optional(v.string()),
    authUserId: v.optional(v.string()),
    email: v.string(),
    name: v.string(),
    userType: v.optional(v.union(v.literal("user"), v.literal("admin"))),
    analyticsSubjectId: v.optional(v.string()),
    deletedAt: v.optional(v.number()),
    anonymizedAt: v.optional(v.number()),
    passwordHash: v.optional(v.string()),
    timezone: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    preferences: v.optional(
      v.object({
        dailyReviewTime: v.optional(v.string()),
        weeklyDigestDay: v.optional(v.string()),
        aiPersonality: v.optional(v.string()),
      }),
    ),
  })
    .index("by_email", ["email"])
    .index("by_token_identifier", ["tokenIdentifier"])
    .index("by_user_type", ["userType"])
    .index("by_analytics_subject_id", ["analyticsSubjectId"]),

  memories: defineTable({
    userId: v.id("users"),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    primaryTopicId: v.optional(v.id("userTopics")),
    topicIds: v.optional(v.array(v.id("userTopics"))),
    people: v.optional(v.array(v.string())),
    locations: v.optional(v.array(v.string())),
    importance: importanceValidator,
    lifeArea: v.optional(lifeAreaValidator),
    contextTags: v.optional(contextTagsValidator),
    sentimentScore: v.optional(v.float64()),
    linkedUrls: v.optional(v.array(v.string())),
    extractedActions: v.optional(extractedActionsValidator),
    entryKind: memoryEntryKindValidator,
    schedule: v.optional(memoryScheduleValidator),
    nextDueAt: v.optional(v.string()),
    capsuleUnlockDate: v.optional(v.string()),
    embedding: v.optional(v.array(v.float64())),
    embeddingState: v.union(v.literal("missing"), v.literal("ready")),
    shareToken: v.optional(v.string()),
    isPublic: v.optional(v.boolean()),
    /** Encryption version used (for migration tracking) */
    encryptionVersion: v.optional(v.number()),
    /**
     * Lifecycle status of the memory.
     * - "active"    — visible everywhere (default)
     * - "deleted"   — soft-deleted, recoverable from Data page
     * - "completed" — completed reminder, hidden from all active APIs
     */
    status: v.union(v.literal("active"), v.literal("deleted"), v.literal("completed")),
    /** When the memory was completed (ms timestamp) */
    completedAt: v.optional(v.float64()),
    /** Timestamp of soft-delete (ms) */
    deletedAt: v.optional(v.float64()),
    /** The corresponding event ID in an external provider (e.g. Google Calendar) */
    googleEventId: v.optional(v.string()),
    googleSyncStatus: v.optional(
      v.union(v.literal("pending"), v.literal("synced"), v.literal("failed")),
    ),
    googleSyncMessage: v.optional(v.string()),
    googleSyncUpdatedAt: v.optional(v.number()),
    googleSyncLockToken: v.optional(v.string()),
    googleSyncLockAt: v.optional(v.number()),
    googleSyncFingerprint: v.optional(v.string()),
    googleSyncDesiredFingerprint: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_user_status", ["userId", "status"])
    .index("by_user_status_entryKind", ["userId", "status", "entryKind"])
    .index("by_user_status_nextDueAt", ["userId", "status", "nextDueAt"])
    .index("by_status_nextDueAt", ["status", "nextDueAt"])
    .index("by_status_embeddingState", ["status", "embeddingState"])
    .index("by_user_primaryTopic", ["userId", "primaryTopicId"])
    .index("by_share_token", ["shareToken"])
    .searchIndex("search_content", {
      searchField: "content",
      filterFields: ["userId"],
    })
    .searchIndex("search_title", {
      searchField: "title",
      filterFields: ["userId"],
    })
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 1536,
      filterFields: ["userId"],
    }),

  userMemoryStats: defineTable({
    userId: v.id("users"),
    totalMemories: v.number(),
    totalReminders: v.number(),
    recurringCount: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  userMemoryDailyCounts: defineTable({
    userId: v.id("users"),
    dayKey: v.string(),
    count: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_day", ["userId", "dayKey"]),

  userAnalyticsSummary: defineTable({
    userId: v.id("users"),
    analyticsSubjectId: v.optional(v.string()),
    trackingStartedAt: v.number(),
    lastActivityAt: v.optional(v.number()),
    totalMemoryCreates: v.number(),
    totalMemoryUpdates: v.number(),
    totalMemoryDeletes: v.number(),
    totalDiaryEntries: v.number(),
    totalChatMessages: v.number(),
    totalAttachmentUploads: v.number(),
    totalAttachmentDeletes: v.number(),
    totalAttachmentBytesUploaded: v.number(),
    liveStorageBytes: v.number(),
    liveStorageCount: v.number(),
    liveImageCount: v.number(),
    liveDocumentCount: v.number(),
    totalAiRequests: v.number(),
    totalAiErrors: v.number(),
    totalAiInputTokens: v.number(),
    totalAiOutputTokens: v.number(),
    totalAiAudioSeconds: v.number(),
    totalAiCostUsdMicros: v.number(),
    totalSearches: v.optional(v.number()),
    totalDeepSearches: v.optional(v.number()),
    totalSearchCacheHits: v.optional(v.number()),
    totalVectorSearches: v.optional(v.number()),
    totalFullTextSearches: v.optional(v.number()),
    totalKeywordSearches: v.optional(v.number()),
    totalSearchResults: v.optional(v.number()),
    totalSearchLatencyMs: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_analytics_subject_id", ["analyticsSubjectId"]),

  userAnalyticsDaily: defineTable({
    userId: v.id("users"),
    analyticsSubjectId: v.optional(v.string()),
    dayKey: v.string(),
    memoryCreates: v.number(),
    memoryUpdates: v.number(),
    memoryDeletes: v.number(),
    diaryEntries: v.number(),
    chatMessages: v.number(),
    attachmentUploads: v.number(),
    attachmentDeletes: v.number(),
    attachmentBytesUploaded: v.number(),
    aiRequests: v.number(),
    aiErrors: v.number(),
    aiInputTokens: v.number(),
    aiOutputTokens: v.number(),
    aiAudioSeconds: v.number(),
    aiCostUsdMicros: v.number(),
    searches: v.optional(v.number()),
    deepSearches: v.optional(v.number()),
    searchCacheHits: v.optional(v.number()),
    vectorSearches: v.optional(v.number()),
    fullTextSearches: v.optional(v.number()),
    keywordSearches: v.optional(v.number()),
    searchResults: v.optional(v.number()),
    searchLatencyMs: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_day", ["userId", "dayKey"])
    .index("by_analytics_subject_id_and_day", ["analyticsSubjectId", "dayKey"]),

  userAnalyticsModelDaily: defineTable({
    userId: v.id("users"),
    analyticsSubjectId: v.optional(v.string()),
    dayKey: v.string(),
    provider: v.string(),
    model: v.string(),
    operation: v.string(),
    feature: v.string(),
    requests: v.number(),
    errors: v.number(),
    inputTokens: v.number(),
    outputTokens: v.number(),
    totalTokens: v.number(),
    audioSeconds: v.number(),
    costUsdMicros: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_day", ["userId", "dayKey"])
    .index("by_user_day_model", ["userId", "dayKey", "provider", "model"])
    .index("by_analytics_subject_id_and_day", ["analyticsSubjectId", "dayKey"]),

  userAiUsageEvents: defineTable({
    userId: v.id("users"),
    analyticsSubjectId: v.optional(v.string()),
    occurredAt: v.number(),
    dayKey: v.string(),
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
  })
    .index("by_user", ["userId"])
    .index("by_user_occurred_at", ["userId", "occurredAt"])
    .index("by_occurred_at", ["occurredAt"])
    .index("by_analytics_subject_id_and_occurred_at", ["analyticsSubjectId", "occurredAt"]),

  userTopics: defineTable({
    userId: v.id("users"),
    name: v.string(),
    slug: v.string(),
    description: v.string(),
    icon: v.string(),
    color: v.string(),
    centroid: v.array(v.float64()),
    memoryCount: v.number(),
    relatedTopics: v.array(
      v.object({
        topicId: v.id("userTopics"),
        similarity: v.float64(),
        edgeType: v.union(v.literal("related"), v.literal("parent"), v.literal("child")),
      }),
    ),
    parentTopicId: v.optional(v.id("userTopics")),
    isArchived: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_isArchived", ["userId", "isArchived"])
    .index("by_user_slug", ["userId", "slug"]),

  memoryTopicLinks: defineTable({
    userId: v.id("users"),
    memoryId: v.id("memories"),
    topicId: v.id("userTopics"),
    isPrimary: v.boolean(),
    assignedAt: v.number(),
  })
    .index("by_memory", ["memoryId"])
    .index("by_topic", ["topicId"])
    .index("by_user", ["userId"])
    .index("by_user_and_topic", ["userId", "topicId"]),

  memoryAttachments: defineTable({
    userId: v.id("users"),
    memoryId: v.optional(v.id("memories")),
    chatMessageId: v.optional(v.id("chatMessages")),
    type: v.union(v.literal("image"), v.literal("document")),
    filename: v.string(),
    mimeType: v.string(),
    sizeBytes: v.number(),
    // Google Drive
    driveFileId: v.string(),
    driveFolderId: v.string(),
    driveWebViewLink: v.optional(v.string()),
    driveThumbnailLink: v.optional(v.string()),
    // AI extraction
    extractedContent: v.optional(v.string()),
    processingStatus: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    processingError: v.optional(v.string()),
    extractionMethod: v.optional(
      v.union(
        v.literal("mlkit"),
        v.literal("gemini"),
        v.literal("openai"),
        v.literal("pdf-extract"),
      ),
    ),
    createdAt: v.number(),
    isDeleted: v.optional(v.boolean()),
  })
    .index("by_user", ["userId"])
    .index("by_memory", ["memoryId"])
    .index("by_chat_message", ["chatMessageId"])
    .index("by_user_and_createdAt", ["userId", "createdAt"]),

  memoryHistory: defineTable({
    memoryId: v.id("memories"),
    userId: v.id("users"),
    previousContent: v.optional(v.string()),
    previousTitle: v.optional(v.string()),
    editedAt: v.float64(),
    changeReason: v.optional(v.string()),
    snapshotJson: v.optional(v.string()),
    /** Encryption version used */
    encryptionVersion: v.optional(v.number()),
  })
    .index("by_memory", ["memoryId"])
    .index("by_user", ["userId"]),

  sharedMemories: defineTable({
    memoryId: v.id("memories"),
    sharedByUserId: v.id("users"),
    shareToken: v.string(),
    expiresAt: v.optional(v.float64()),
    viewCount: v.float64(),
    isActive: v.boolean(),
  })
    .index("by_token", ["shareToken"])
    .index("by_memory", ["memoryId"])
    .index("by_user", ["sharedByUserId"]),

  notificationPreferences: defineTable({
    userId: v.id("users"),
    dailyReview: v.boolean(),
    dailyReviewTime: v.optional(v.string()),
    weeklyDigest: v.boolean(),
    weeklyDigestDay: v.optional(v.string()),
    memoryNudges: v.boolean(),
    capsuleAlerts: v.boolean(),
    pushEnabled: v.boolean(),
  }).index("by_user", ["userId"]),

  diaryEntries: defineTable({
    userId: v.id("users"),
    rawText: v.optional(v.string()),
    correctedText: v.optional(v.string()),
    mood: v.optional(moodValidator),
    energyLevel: v.optional(energyLevelValidator),
    topics: v.optional(v.array(v.string())),
    summary: v.optional(v.string()),
    structuredInsights: v.optional(
      v.array(v.object({ insight: v.string(), category: v.string() })),
    ),
    habitsDetected: v.optional(
      v.array(
        v.object({
          habit: v.string(),
          sentiment: v.union(v.literal("positive"), v.literal("negative"), v.literal("neutral")),
          frequencyHint: v.optional(v.string()),
        }),
      ),
    ),
    personalityTraits: v.optional(v.array(v.object({ trait: v.string(), evidence: v.string() }))),
    likes: v.optional(v.array(v.string())),
    dislikes: v.optional(v.array(v.string())),
    actionItems: v.optional(v.array(v.string())),
    /** Encryption version used */
    encryptionVersion: v.optional(v.number()),
  }).index("by_user", ["userId"]),

  reviewCards: defineTable({
    userId: v.id("users"),
    memoryId: v.id("memories"),
    nextReviewAt: v.string(),
    intervalDays: v.float64(),
    easeFactor: v.float64(),
    repetitions: v.float64(),
    lastReviewedAt: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_user_nextReviewAt", ["userId", "nextReviewAt"])
    .index("by_memory", ["memoryId"]),

  nudges: defineTable({
    userId: v.id("users"),
    title: v.optional(v.string()),
    message: v.optional(v.string()),
    nudgeType: v.string(),
    priority: priorityValidator,
    isDismissed: v.boolean(),
    isActedOn: v.boolean(),
    basedOnDiaryEntryIds: v.optional(v.array(v.id("diaryEntries"))),
    expiresAt: v.optional(v.float64()),
    /** Encryption version used */
    encryptionVersion: v.optional(v.number()),
  }).index("by_user", ["userId"]),

  chatMessages: defineTable({
    userId: v.id("users"),
    conversationId: v.optional(v.string()),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.optional(v.string()),
    attachments: v.optional(
      v.array(
        v.object({
          attachmentId: v.id("memoryAttachments"),
          name: v.string(),
          type: v.union(v.literal("image"), v.literal("document")),
          mimeType: v.string(),
        }),
      ),
    ),
    /** Encryption version used */
    encryptionVersion: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_user_conversation", ["userId", "conversationId"]),

  sessions: defineTable({
    userId: v.id("users"),
    token: v.string(),
    expiresAt: v.float64(),
  })
    .index("by_token", ["token"])
    .index("by_user", ["userId"]),

  /**
   * Audit log for sensitive operations
   * Tracks access and modifications for compliance
   */
  auditLogs: defineTable({
    userId: v.id("users"),
    action: auditActionValidator,
    /** Resource type that was accessed/modified */
    resourceType: v.optional(v.string()),
    /** ID of the resource (e.g., memory ID) */
    resourceId: v.optional(v.string()),
    /** Additional context (IP, user agent hash, etc.) */
    metadata: v.optional(v.record(v.string(), v.string())),
    /** Timestamp of the action */
    timestamp: v.float64(),
  })
    .index("by_user", ["userId"])
    .index("by_user_action", ["userId", "action"])
    .index("by_timestamp", ["timestamp"]),

  /**
   * Privacy consent tracking for GDPR/CCPA compliance
   */
  privacyConsent: defineTable({
    userId: v.id("users"),
    /** Version of privacy policy consented to */
    policyVersion: v.string(),
    /** Whether user consented to AI processing of their data */
    aiProcessingConsent: v.boolean(),
    /** Whether user consented to analytics */
    analyticsConsent: v.boolean(),
    /** When consent was given */
    consentedAt: v.float64(),
    /** IP address (hashed) at time of consent */
    ipHash: v.optional(v.string()),
  }).index("by_user", ["userId"]),

  /**
   * Transient per-user state written by chat/deep-search actions while tools
   * are in-flight. The client subscribes reactively and shows live backend
   * progress such as searching, creating, updating, or analyzing.
   * Rows are created/updated on tool invocation and deleted when done.
   */
  chatSearchStatus: defineTable({
    userId: v.id("users"),
    query: v.optional(v.string()),
    phase: v.optional(v.string()),
    toolName: v.optional(v.string()),
    detail: v.optional(v.string()),
    source: v.optional(v.string()),
    cacheState: v.optional(v.string()),
    resultCount: v.optional(v.number()),
    previewItems: v.optional(v.array(v.string())),
    events: v.optional(
      v.array(
        v.object({
          label: v.string(),
          value: v.optional(v.string()),
        }),
      ),
    ),
    step: v.optional(v.number()),
    totalSteps: v.optional(v.number()),
    startedAt: v.number(),
    updatedAt: v.optional(v.number()),
  }).index("by_user", ["userId"]),

  searchQueryCache: defineTable({
    userId: v.id("users"),
    queryHash: v.string(), // lowercase trimmed query (first 100 chars)
    expandedQuery: v.optional(v.string()), // GPT-expanded query string
    embedding: v.optional(v.array(v.float64())), // text-embedding vector
    lastUsedAt: v.number(), // ms timestamp — used for TTL eviction
  })
    .index("by_user", ["userId"])
    .index("by_user_hash", ["userId", "queryHash"])
    .index("by_last_used_at", ["lastUsedAt"]),

  userIntegrations: defineTable({
    userId: v.id("users"),
    provider: v.literal("google"),
    refreshToken: v.string(),
    email: v.optional(v.string()),
    clientId: v.optional(v.string()),
    // Kept optional for backward compatibility with existing stored integrations.
    grantedScopes: v.optional(v.array(v.string())),
    platform: v.optional(v.union(v.literal("android"), v.literal("ios"), v.literal("web"))),
    // Cached Google Drive folder IDs
    driveFolderId: v.optional(v.string()),
    driveMonthFolderId: v.optional(v.string()),
    driveMonthFolderKey: v.optional(v.string()), // "YYYY-MM" key for the cached month folder
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  ...authTables,
});
