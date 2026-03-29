import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "./authSchema";
import {
  moodValidator,
  importanceValidator,
  lifeAreaValidator,
  recurrenceValidator,
  categoryValidator,
  extractedActionsValidator,
  contextTagsValidator,
  energyLevelValidator,
  priorityValidator,
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
    title: v.string(),
    content: v.string(),
    category: categoryValidator,
    mood: v.optional(moodValidator),
    tags: v.array(v.string()),
    people: v.array(v.string()),
    locations: v.array(v.string()),
    importance: importanceValidator,
    lifeArea: v.optional(lifeAreaValidator),
    contextTags: v.optional(contextTagsValidator),
    sentimentScore: v.optional(v.float64()),
    linkedUrls: v.array(v.string()),
    extractedActions: v.optional(extractedActionsValidator),
    reminderDate: v.optional(v.string()),
    isRecurring: v.boolean(),
    recurrenceType: v.optional(recurrenceValidator),
    capsuleUnlockDate: v.optional(v.string()),
    embedding: v.optional(v.array(v.float64())),
    shareToken: v.optional(v.string()),
    isPublic: v.optional(v.boolean()),
  })
    .index("by_user", ["userId"])
    .index("by_user_category", ["userId", "category"])
    .index("by_user_reminderDate", ["userId", "reminderDate"])
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
    previousContent: v.string(),
    previousTitle: v.string(),
    editedAt: v.float64(),
    changeReason: v.optional(v.string()),
    snapshotJson: v.optional(v.string()),
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
    rawText: v.string(),
    correctedText: v.optional(v.string()),
    mood: v.optional(moodValidator),
    energyLevel: v.optional(energyLevelValidator),
    topics: v.array(v.string()),
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
    title: v.string(),
    message: v.string(),
    nudgeType: v.string(),
    priority: priorityValidator,
    isDismissed: v.boolean(),
    isActedOn: v.boolean(),
    basedOnDiaryEntryIds: v.optional(v.array(v.id("diaryEntries"))),
    expiresAt: v.optional(v.float64()),
  }).index("by_user", ["userId"]),

  chatMessages: defineTable({
    userId: v.id("users"),
    conversationId: v.optional(v.string()),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    attachments: v.optional(
      v.array(
        v.object({
          name: v.string(),
          type: v.string(),
          uri: v.string(),
        })
      )
    ),
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

  ...authTables,
});
