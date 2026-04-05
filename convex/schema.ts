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
  encryptedEnvelopeValidator,
  keyMaterialValidator,
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
    /** Plain text title */
    title: v.optional(v.string()),
    /** Plain text content */
    content: v.optional(v.string()),
    /** Encrypted title envelope */
    encryptedTitle: v.optional(encryptedEnvelopeValidator),
    /** Encrypted content envelope */
    encryptedContent: v.optional(encryptedEnvelopeValidator),
    /** Blind index for title search (HMAC hash) */
    titleBlindIndex: v.optional(v.string()),
    /** Primary AI-assigned topic (indexed for fast filtering) */
    primaryTopicId: v.optional(v.id("userTopics")),
    /** All AI-assigned topics (1–3) */
    topicIds: v.optional(v.array(v.id("userTopics"))),
    /** Plain text people */
    people: v.optional(v.array(v.string())),
    /** Encrypted people array */
    encryptedPeople: v.optional(encryptedEnvelopeValidator),
    /** Plain text locations */
    locations: v.optional(v.array(v.string())),
    /** Encrypted locations array */
    encryptedLocations: v.optional(encryptedEnvelopeValidator),
    importance: importanceValidator,
    lifeArea: v.optional(lifeAreaValidator),
    contextTags: v.optional(contextTagsValidator),
    sentimentScore: v.optional(v.float64()),
    linkedUrls: v.optional(v.array(v.string())),
    extractedActions: v.optional(extractedActionsValidator),
    entryKind: memoryEntryKindValidator,
    schedule: v.optional(memoryScheduleValidator),
    capsuleUnlockDate: v.optional(v.string()),
    embedding: v.optional(v.array(v.float64())),
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
    /** Plain text - will be removed after migration */
    previousContent: v.optional(v.string()),
    /** Encrypted previous content */
    encryptedPreviousContent: v.optional(encryptedEnvelopeValidator),
    /** Plain text - will be removed after migration */
    previousTitle: v.optional(v.string()),
    /** Encrypted previous title */
    encryptedPreviousTitle: v.optional(encryptedEnvelopeValidator),
    editedAt: v.float64(),
    changeReason: v.optional(v.string()),
    /** Plain text snapshot - will be removed after migration */
    snapshotJson: v.optional(v.string()),
    /** Encrypted full snapshot */
    encryptedSnapshot: v.optional(encryptedEnvelopeValidator),
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
    /** Plain text - will be removed after migration */
    rawText: v.optional(v.string()),
    /** Encrypted raw text */
    encryptedRawText: v.optional(encryptedEnvelopeValidator),
    /** Plain text - will be removed after migration */
    correctedText: v.optional(v.string()),
    /** Encrypted corrected text */
    encryptedCorrectedText: v.optional(encryptedEnvelopeValidator),
    mood: v.optional(moodValidator),
    energyLevel: v.optional(energyLevelValidator),
    /** Plain text topics - will be migrated */
    topics: v.optional(v.array(v.string())),
    /** Encrypted topics */
    encryptedTopics: v.optional(encryptedEnvelopeValidator),
    /** Plain text - will be removed after migration */
    summary: v.optional(v.string()),
    /** Encrypted summary */
    encryptedSummary: v.optional(encryptedEnvelopeValidator),
    /** Plain text - will be removed after migration */
    structuredInsights: v.optional(
      v.array(v.object({ insight: v.string(), category: v.string() }))
    ),
    /** Encrypted structured insights */
    encryptedInsights: v.optional(encryptedEnvelopeValidator),
    /** Plain text - will be removed after migration */
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
    /** Encrypted habits */
    encryptedHabits: v.optional(encryptedEnvelopeValidator),
    /** Plain text - will be removed after migration */
    personalityTraits: v.optional(
      v.array(v.object({ trait: v.string(), evidence: v.string() }))
    ),
    /** Encrypted personality traits */
    encryptedPersonality: v.optional(encryptedEnvelopeValidator),
    /** Plain text - will be removed after migration */
    likes: v.optional(v.array(v.string())),
    /** Encrypted likes */
    encryptedLikes: v.optional(encryptedEnvelopeValidator),
    /** Plain text - will be removed after migration */
    dislikes: v.optional(v.array(v.string())),
    /** Encrypted dislikes */
    encryptedDislikes: v.optional(encryptedEnvelopeValidator),
    /** Plain text - will be removed after migration */
    actionItems: v.optional(v.array(v.string())),
    /** Encrypted action items */
    encryptedActionItems: v.optional(encryptedEnvelopeValidator),
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
    /** Plain text - will be removed after migration */
    title: v.optional(v.string()),
    /** Encrypted title */
    encryptedTitle: v.optional(encryptedEnvelopeValidator),
    /** Plain text - will be removed after migration */
    message: v.optional(v.string()),
    /** Encrypted message */
    encryptedMessage: v.optional(encryptedEnvelopeValidator),
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
    /** Plain text - will be removed after migration */
    content: v.optional(v.string()),
    /** Encrypted message content */
    encryptedContent: v.optional(encryptedEnvelopeValidator),
    /** Plain text attachments - will be migrated */
    attachments: v.optional(
      v.array(
        v.object({
          name: v.string(),
          type: v.string(),
          uri: v.string(),
        })
      )
    ),
    /** Encrypted attachments metadata */
    encryptedAttachments: v.optional(encryptedEnvelopeValidator),
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

  // ============================================
  // ENCRYPTION & PRIVACY TABLES
  // ============================================

  /**
   * User encryption key material
   * Stores the encrypted DEK (Data Encryption Key) for each user
   * The DEK is encrypted with a key derived from the user's password
   */
  userKeys: defineTable({
    userId: v.id("users"),
    /** Encrypted key material (DEK wrapped with password-derived key) */
    keyMaterial: keyMaterialValidator,
    /** Index key for blind indexing (encrypted with DEK) */
    encryptedIndexKey: v.optional(v.string()),
    /** When encryption was set up */
    createdAt: v.float64(),
    /** When key material was last updated (e.g., password change) */
    updatedAt: v.float64(),
  }).index("by_user", ["userId"]),

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

  ...authTables,
});
