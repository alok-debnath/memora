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
      memoryAttachments,
      notificationPreferences,
      aiProviderPreference,
      aiProviderSecrets,
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
        .query("memoryAttachments")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .take(10000),
      ctx.db
        .query("notificationPreferences")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .first(),
      ctx.db
        .query("userAiProviderPreferences")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .unique(),
      ctx.db
        .query("userAiProviderSecrets")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .take(20),
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
        primaryTopicId: m.primaryTopicId,
        topicIds: m.topicIds,
        people: m.people,
        locations: m.locations,
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
        correctedText: d.correctedText,
        mood: d.mood,
        energyLevel: d.energyLevel,
        topics: d.topics,
        summary: d.summary,
        structuredInsights: d.structuredInsights,
        habitsDetected: d.habitsDetected,
        personalityTraits: d.personalityTraits,
        likes: d.likes,
        dislikes: d.dislikes,
        actionItems: d.actionItems,
      })),
      chatMessages: chatMessages.map((c) => ({
        id: c._id,
        createdAt: new Date(c._creationTime).toISOString(),
        conversationId: c.conversationId,
        role: c.role,
        content: c.content,
        attachments: c.attachments,
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
        message: n.message,
        nudgeType: n.nudgeType,
        priority: n.priority,
        isDismissed: n.isDismissed,
        isActedOn: n.isActedOn,
      })),
      memoryHistory: memoryHistory.map((h) => ({
        id: h._id,
        memoryId: h.memoryId,
        previousTitle: h.previousTitle,
        previousContent: h.previousContent,
        editedAt: new Date(h.editedAt).toISOString(),
        changeReason: h.changeReason,
      })),
      attachments: memoryAttachments.map((a) => ({
        id: a._id,
        createdAt: new Date(a._creationTime).toISOString(),
        filename: a.filename,
        type: a.type,
        mimeType: a.mimeType,
        sizeBytes: a.sizeBytes,
        driveFileId: a.driveFileId,
        driveWebViewLink: a.driveWebViewLink,
        extractedContent: a.extractedContent,
        processingStatus: a.processingStatus,
        memoryId: a.memoryId,
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
      aiProviderSettings: {
        preference: aiProviderPreference
          ? {
              byokEnabled: aiProviderPreference.byokEnabled,
              preferredProvider: aiProviderPreference.preferredProvider,
            }
          : null,
        configuredProviders: aiProviderSecrets.map((secret) => ({
          provider: secret.provider,
          maskedKeySuffix: secret.maskedKeySuffix,
          lastValidatedAt: secret.lastValidatedAt
            ? new Date(secret.lastValidatedAt).toISOString()
            : undefined,
          lastValidationStatus: secret.lastValidationStatus,
        })),
      },
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
        title: m.title,
        content: m.content,
        primaryTopicId: m.primaryTopicId,
        topicIds: m.topicIds,
        people: m.people,
        locations: m.locations,
        importance: m.importance,
        createdAt: new Date(m._creationTime).toISOString(),
        entryKind: m.entryKind,
        schedule: m.schedule,
      })),
    };
  },
});
