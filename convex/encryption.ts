/**
 * Encryption key management mutations
 * Handles user encryption key storage and retrieval
 */
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { resolveUser } from "./lib/withAuth";
import { keyMaterialValidator } from "./lib/validators";

/**
 * Check if user has encryption set up
 */
export const hasEncryption = query({
  args: {},
  handler: async (ctx) => {
    const user = await resolveUser(ctx);
    const userKey = await ctx.db
      .query("userKeys")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    return userKey !== null;
  },
});

/**
 * Get user's encrypted key material
 * This is called on login to unlock the encryption key
 */
export const getKeyMaterial = query({
  args: {},
  handler: async (ctx) => {
    const user = await resolveUser(ctx);
    const userKey = await ctx.db
      .query("userKeys")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    
    if (!userKey) {
      return null;
    }
    
    return {
      keyMaterial: userKey.keyMaterial,
      encryptedIndexKey: userKey.encryptedIndexKey,
    };
  },
});

/**
 * Initialize encryption for a user
 * Called when user first sets up encryption (usually on signup or first login)
 */
export const initializeEncryption = mutation({
  args: {
    keyMaterial: keyMaterialValidator,
    encryptedIndexKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await resolveUser(ctx);
    
    // Check if user already has encryption set up
    const existing = await ctx.db
      .query("userKeys")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    
    if (existing) {
      throw new Error("Encryption already initialized for this user");
    }
    
    const now = Date.now();
    await ctx.db.insert("userKeys", {
      userId: user._id,
      keyMaterial: args.keyMaterial,
      encryptedIndexKey: args.encryptedIndexKey,
      createdAt: now,
      updatedAt: now,
    });
    
    // Log the encryption setup in audit log
    await ctx.db.insert("auditLogs", {
      userId: user._id,
      action: "encryption.setup",
      timestamp: now,
    });
    
    return { success: true };
  },
});

/**
 * Update key material (e.g., after password change)
 * The DEK stays the same, just re-encrypted with new password-derived key
 */
export const updateKeyMaterial = mutation({
  args: {
    keyMaterial: keyMaterialValidator,
  },
  handler: async (ctx, args) => {
    const user = await resolveUser(ctx);
    
    const existing = await ctx.db
      .query("userKeys")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    
    if (!existing) {
      throw new Error("Encryption not initialized");
    }
    
    const now = Date.now();
    await ctx.db.patch(existing._id, {
      keyMaterial: args.keyMaterial,
      updatedAt: now,
    });
    
    // Log the rekey operation
    await ctx.db.insert("auditLogs", {
      userId: user._id,
      action: "encryption.rekey",
      timestamp: now,
    });
    
    return { success: true };
  },
});

/**
 * Delete user's encryption keys (part of account deletion)
 */
export const deleteUserKeys = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await resolveUser(ctx);
    
    const userKey = await ctx.db
      .query("userKeys")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    
    if (userKey) {
      await ctx.db.delete(userKey._id);
    }
    
    return { success: true };
  },
});
