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
    passwordHash: v.optional(v.string()),
    timezone: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    preferences: v.optional(
      v.object({
        dailyReviewTime: v.optional(v.string()),
        weeklyDigestDay: v.optional(v.string()),
        aiPersonality: v.optional(v.string()),
      })
    ),
  })
    .index("by_email", ["email"])
    .index("by_token_identifier", ["tokenIdentifier"]),

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
    status: v.union(
      v.literal("active"),
      v.literal("deleted"),
      v.literal("completed")
    ),
    /** When the memory was completed (ms timestamp) */
    completedAt: v.optional(v.float64()),
    /** Timestamp of soft-delete (ms) */
    deletedAt: v.optional(v.float64()),
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

  userTopics: defineTable({
    userId: v.id("users"),
    name: v.string(),
    slug: v.string(),
    description: v.string(),
    icon: v.string(),
    color: v.string(),
    centroid: v.array(v.float64()),
    memoryCount: v.number(),
    relatedTopics: v.array(v.object({
      topicId: v.id("userTopics"),
      similarity: v.float64(),
      edgeType: v.union(v.literal("related"), v.literal("parent"), v.literal("child")),
    })),
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
    memoryId: v.id("memories"),
    userId: v.id("users"),
    type: v.union(
      v.literal("image"),
      v.literal("audio"),
      v.literal("document"),
      v.literal("link")
    ),
    url: v.string(),
    filename: v.optional(v.string()),
    mimeType: v.optional(v.string()),
    sizeBytes: v.optional(v.float64()),
  })
    .index("by_memory", ["memoryId"])
    .index("by_user", ["userId"]),

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

  documentExtractions: defineTable({
    userId: v.id("users"),
    filename: v.string(),
    extractedText: v.string(),
    summary: v.optional(v.string()),
    documentType: v.optional(v.string()),
    expiryDate: v.optional(v.string()),
    keyDetails: v.optional(v.record(v.string(), v.string())),
    embedding: v.optional(v.array(v.float64())),
    memoryCount: v.optional(v.float64()),
    generatedMemoryIds: v.array(v.id("memories")),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed")
    ),
  })
    .index("by_user", ["userId"])
    .index("by_user_type", ["userId", "documentType"])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 1536,
      filterFields: ["userId"],
    }),

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
      v.array(v.object({ insight: v.string(), category: v.string() }))
    ),
    habitsDetected: v.optional(
      v.array(
        v.object({
          habit: v.string(),
          sentiment: v.union(
            v.literal("positive"),
            v.literal("negative"),
            v.literal("neutral")
          ),
          frequencyHint: v.optional(v.string()),
        })
      )
    ),
    personalityTraits: v.optional(
      v.array(v.object({ trait: v.string(), evidence: v.string() }))
    ),
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
          name: v.string(),
          type: v.string(),
          uri: v.string(),
        })
      )
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
        })
      )
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

  ...authTables,
});
