/**
 * GDPR/CCPA compliant data export
 * Provides full data portability for users
 */
import { v } from "convex/values";
import { query, mutation, internalQuery } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { resolveUser } from "./lib/withAuth";

/**
 * Export all user data (GDPR Article 20 - Right to data portability)
 * Returns all data associated with the user in a portable format
 */
export const exportAllData = query({
  args: {},
  handler: async (ctx) => {
    const user = await resolveUser(ctx);
    
    // Fetch all user data from various tables
    const [
      memories,
      diaryEntries,
      chatMessages,
      reviewCards,
      nudges,
      memoryHistory,
      documentExtractions,
      notificationPreferences,
      auditLogs,
      privacyConsent,
    ] = await Promise.all([
      ctx.db
        .query("memories")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .take(10000),
      ctx.db
        .query("diaryEntries")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .take(10000),
      ctx.db
        .query("chatMessages")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .take(10000),
      ctx.db
        .query("reviewCards")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .take(10000),
      ctx.db
        .query("nudges")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .take(10000),
      ctx.db
        .query("memoryHistory")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .take(10000),
      ctx.db
        .query("documentExtractions")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .take(10000),
      ctx.db
        .query("notificationPreferences")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .first(),
      ctx.db
        .query("auditLogs")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .take(10000),
      ctx.db
        .query("privacyConsent")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .take(100),
    ]);
    
    // Format the export
    const exportData = {
      exportedAt: new Date().toISOString(),
      exportVersion: "1.0",
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        timezone: user.timezone,
      },
      memories: memories.map((m) => ({
        id: m._id,
        createdAt: new Date(m._creationTime).toISOString(),
        title: m.title,
        content: m.content,
        encryptedTitle: m.encryptedTitle,
        encryptedContent: m.encryptedContent,
        primaryTopicId: m.primaryTopicId,
        topicIds: m.topicIds,
        mood: m.mood,
        people: m.people,
        encryptedPeople: m.encryptedPeople,
        locations: m.locations,
        encryptedLocations: m.encryptedLocations,
        importance: m.importance,
        lifeArea: m.lifeArea,
        entryKind: m.entryKind,
        schedule: m.schedule,
        capsuleUnlockDate: m.capsuleUnlockDate,
        isPublic: m.isPublic,
        deletedAt: m.deletedAt ? new Date(m.deletedAt).toISOString() : undefined,
      })),
      diaryEntries: diaryEntries.map((d) => ({
        id: d._id,
        createdAt: new Date(d._creationTime).toISOString(),
        rawText: d.rawText,
        encryptedRawText: d.encryptedRawText,
        correctedText: d.correctedText,
        encryptedCorrectedText: d.encryptedCorrectedText,
        mood: d.mood,
        energyLevel: d.energyLevel,
        topics: d.topics,
        encryptedTopics: d.encryptedTopics,
        summary: d.summary,
        encryptedSummary: d.encryptedSummary,
        structuredInsights: d.structuredInsights,
        encryptedInsights: d.encryptedInsights,
        habitsDetected: d.habitsDetected,
        encryptedHabits: d.encryptedHabits,
        personalityTraits: d.personalityTraits,
        encryptedPersonality: d.encryptedPersonality,
        likes: d.likes,
        encryptedLikes: d.encryptedLikes,
        dislikes: d.dislikes,
        encryptedDislikes: d.encryptedDislikes,
        actionItems: d.actionItems,
        encryptedActionItems: d.encryptedActionItems,
      })),
      chatMessages: chatMessages.map((c) => ({
        id: c._id,
        createdAt: new Date(c._creationTime).toISOString(),
        conversationId: c.conversationId,
        role: c.role,
        content: c.content,
        encryptedContent: c.encryptedContent,
        attachments: c.attachments,
        encryptedAttachments: c.encryptedAttachments,
      })),
      reviewCards: reviewCards.map((r) => ({
        id: r._id,
        memoryId: r.memoryId,
        nextReviewAt: r.nextReviewAt,
        intervalDays: r.intervalDays,
        easeFactor: r.easeFactor,
        repetitions: r.repetitions,
        lastReviewedAt: r.lastReviewedAt,
      })),
      nudges: nudges.map((n) => ({
        id: n._id,
        createdAt: new Date(n._creationTime).toISOString(),
        title: n.title,
        encryptedTitle: n.encryptedTitle,
        message: n.message,
        encryptedMessage: n.encryptedMessage,
        nudgeType: n.nudgeType,
        priority: n.priority,
        isDismissed: n.isDismissed,
        isActedOn: n.isActedOn,
      })),
      memoryHistory: memoryHistory.map((h) => ({
        id: h._id,
        memoryId: h.memoryId,
        previousTitle: h.previousTitle,
        encryptedPreviousTitle: h.encryptedPreviousTitle,
        previousContent: h.previousContent,
        encryptedPreviousContent: h.encryptedPreviousContent,
        editedAt: new Date(h.editedAt).toISOString(),
        changeReason: h.changeReason,
      })),
      documentExtractions: documentExtractions.map((d) => ({
        id: d._id,
        createdAt: new Date(d._creationTime).toISOString(),
        filename: d.filename,
        extractedText: d.extractedText,
        summary: d.summary,
        documentType: d.documentType,
        status: d.status,
      })),
      preferences: notificationPreferences
        ? {
            dailyReview: notificationPreferences.dailyReview,
            dailyReviewTime: notificationPreferences.dailyReviewTime,
            weeklyDigest: notificationPreferences.weeklyDigest,
            weeklyDigestDay: notificationPreferences.weeklyDigestDay,
            memoryNudges: notificationPreferences.memoryNudges,
            capsuleAlerts: notificationPreferences.capsuleAlerts,
            pushEnabled: notificationPreferences.pushEnabled,
          }
        : null,
      auditLogs: auditLogs.map((a) => ({
        action: a.action,
        resourceType: a.resourceType,
        timestamp: new Date(a.timestamp).toISOString(),
      })),
      privacyConsent: privacyConsent.map((p) => ({
        policyVersion: p.policyVersion,
        aiProcessingConsent: p.aiProcessingConsent,
        analyticsConsent: p.analyticsConsent,
        consentedAt: new Date(p.consentedAt).toISOString(),
      })),
    };
    
    return exportData;
  },
});

/**
 * Export memories only (simpler export for backup)
 */
export const exportMemoriesOnly = query({
  args: {},
  handler: async (ctx) => {
    const user = await resolveUser(ctx);
    
    const memories = await ctx.db
      .query("memories")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .take(10000);
    
    const active = memories.filter((m) => m.status === "active");
    return {
      exportedAt: new Date().toISOString(),
      format: "memories_v1",
      count: active.length,
      memories: active.map((m) => ({
        title: m.title ?? m.encryptedTitle,
        content: m.content ?? m.encryptedContent,
        primaryTopicId: m.primaryTopicId,
        topicIds: m.topicIds,
        mood: m.mood,
        people: m.people ?? m.encryptedPeople,
        locations: m.locations ?? m.encryptedLocations,
        importance: m.importance,
        createdAt: new Date(m._creationTime).toISOString(),
        entryKind: m.entryKind,
        schedule: m.schedule,
      })),
    };
  },
});
