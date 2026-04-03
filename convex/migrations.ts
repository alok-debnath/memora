/**
 * Data migration utilities
 * Handles deletion of existing plaintext data
 */
import { v } from "convex/values";
import { mutation, internalMutation } from "./_generated/server";
import { resolveUser } from "./lib/withAuth";

/**
 * Wipe all existing user data
 * Use this when user wants to start fresh with encryption
 * This is irreversible!
 */
export const wipeAllUserData = mutation({
  args: {
    confirmPhrase: v.string(),
  },
  handler: async (ctx, args) => {
    // Require explicit confirmation
    if (args.confirmPhrase !== "DELETE ALL MY DATA") {
      throw new Error("Invalid confirmation phrase");
    }
    
    const user = await resolveUser(ctx);
    const BATCH = 200;
    let totalDeleted = 0;
    let hasMore = false;
    
    // Delete from all tables in batches
    const tables = [
      "memoryAttachments",
      "memoryHistory",
      "documentExtractions",
      "diaryEntries",
      "reviewCards",
      "nudges",
      "chatMessages",
    ] as const;
    
    for (const table of tables) {
      const docs = await ctx.db
        .query(table)
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .take(BATCH);
      
      for (const doc of docs) {
        await ctx.db.delete(doc._id);
        totalDeleted++;
      }
      
      if (docs.length >= BATCH) hasMore = true;
    }
    
    // Delete shared memories
    const shares = await ctx.db
      .query("sharedMemories")
      .withIndex("by_user", (q) => q.eq("sharedByUserId", user._id))
      .take(BATCH);
    
    for (const share of shares) {
      await ctx.db.delete(share._id);
      totalDeleted++;
    }
    if (shares.length >= BATCH) hasMore = true;
    
    // Delete memories
    const memories = await ctx.db
      .query("memories")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .take(BATCH);
    
    for (const memory of memories) {
      await ctx.db.delete(memory._id);
      totalDeleted++;
    }
    if (memories.length >= BATCH) hasMore = true;
    
    // Log the deletion
    await ctx.db.insert("auditLogs", {
      userId: user._id,
      action: "account.delete",
      resourceType: "data_wipe",
      metadata: {
        deletedCount: String(totalDeleted),
        complete: String(!hasMore),
      },
      timestamp: Date.now(),
    });
    
    if (hasMore) {
      // More data to delete - client should call again
      return {
        success: false,
        message: "Deletion in progress, please call again to continue",
        deletedThisBatch: totalDeleted,
      };
    }
    
    return {
      success: true,
      message: "All data deleted",
      totalDeleted,
    };
  },
});

/**
 * Clear plaintext fields from encrypted records
 * Run this after user has verified their encrypted data works
 */
export const clearPlaintextFields = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await resolveUser(ctx);
    const BATCH = 100;
    let updated = 0;
    
    // Clear plaintext from memories that have encrypted versions
    const memories = await ctx.db
      .query("memories")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .take(BATCH);
    
    for (const memory of memories) {
      if (memory.encryptedContent && memory.content) {
        await ctx.db.patch(memory._id, {
          title: undefined,
          content: undefined,
          people: undefined,
          locations: undefined,
        });
        updated++;
      }
    }
    
    // Clear plaintext from diary entries
    const diaryEntries = await ctx.db
      .query("diaryEntries")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .take(BATCH);
    
    for (const entry of diaryEntries) {
      if (entry.encryptedRawText && entry.rawText) {
        await ctx.db.patch(entry._id, {
          rawText: undefined,
          correctedText: undefined,
          topics: undefined,
          summary: undefined,
          structuredInsights: undefined,
          habitsDetected: undefined,
          personalityTraits: undefined,
          likes: undefined,
          dislikes: undefined,
          actionItems: undefined,
        });
        updated++;
      }
    }
    
    // Clear plaintext from chat messages
    const chatMessages = await ctx.db
      .query("chatMessages")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .take(BATCH);
    
    for (const message of chatMessages) {
      if (message.encryptedContent && message.content) {
        await ctx.db.patch(message._id, {
          content: undefined,
          attachments: undefined,
        });
        updated++;
      }
    }
    
    const hasMore =
      memories.length >= BATCH ||
      diaryEntries.length >= BATCH ||
      chatMessages.length >= BATCH;
    
    return {
      updatedThisBatch: updated,
      complete: !hasMore,
      message: hasMore ? "Please call again to continue" : "Migration complete",
    };
  },
});

/**
 * Get migration status - how much data needs encryption
 */
export const getMigrationStatus = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await resolveUser(ctx);
    
    // Count records needing encryption
    const memories = await ctx.db
      .query("memories")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .take(10000);
    
    const unencryptedMemories = memories.filter(
      (m) => m.content && !m.encryptedContent
    ).length;
    
    const diaryEntries = await ctx.db
      .query("diaryEntries")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .take(10000);
    
    const unencryptedDiary = diaryEntries.filter(
      (d) => d.rawText && !d.encryptedRawText
    ).length;
    
    const chatMessages = await ctx.db
      .query("chatMessages")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .take(10000);
    
    const unencryptedChat = chatMessages.filter(
      (c) => c.content && !c.encryptedContent
    ).length;
    
    return {
      totalMemories: memories.length,
      unencryptedMemories,
      totalDiaryEntries: diaryEntries.length,
      unencryptedDiary,
      totalChatMessages: chatMessages.length,
      unencryptedChat,
      needsMigration:
        unencryptedMemories > 0 ||
        unencryptedDiary > 0 ||
        unencryptedChat > 0,
    };
  },
});
