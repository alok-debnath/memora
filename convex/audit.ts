/**
 * Audit logging utilities
 * Tracks sensitive operations for compliance and security monitoring
 */
import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { resolveUser } from "./lib/withAuth";
import { auditActionValidator } from "./lib/validators";

type AuditAction = 
  | "memory.create"
  | "memory.read"
  | "memory.update"
  | "memory.delete"
  | "memory.share"
  | "diary.create"
  | "diary.read"
  | "diary.delete"
  | "chat.create"
  | "data.export"
  | "account.login"
  | "account.logout"
  | "account.delete"
  | "encryption.setup"
  | "encryption.rekey";

/**
 * Internal mutation to log an audit event
 * Used by other mutations to log actions
 */
export const logEvent = internalMutation({
  args: {
    userId: v.id("users"),
    action: auditActionValidator,
    resourceType: v.optional(v.string()),
    resourceId: v.optional(v.string()),
    metadata: v.optional(v.record(v.string(), v.string())),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("auditLogs", {
      userId: args.userId,
      action: args.action,
      resourceType: args.resourceType,
      resourceId: args.resourceId,
      metadata: args.metadata,
      timestamp: Date.now(),
    });
  },
});

/**
 * Get audit logs for the current user
 * Useful for users to see their own activity
 */
export const getMyLogs = query({
  args: {
    limit: v.optional(v.number()),
    action: v.optional(auditActionValidator),
  },
  handler: async (ctx, args) => {
    const user = await resolveUser(ctx);
    const limit = args.limit ?? 100;
    
    if (args.action) {
      return await ctx.db
        .query("auditLogs")
        .withIndex("by_user_action", (q) => 
          q.eq("userId", user._id).eq("action", args.action!)
        )
        .order("desc")
        .take(limit);
    }
    
    return await ctx.db
      .query("auditLogs")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(limit);
  },
});

/**
 * Delete old audit logs (data retention)
 * Keeps logs for a configurable period
 */
export const cleanupOldLogs = internalMutation({
  args: {
    retentionDays: v.number(),
  },
  handler: async (ctx, args) => {
    const cutoff = Date.now() - args.retentionDays * 24 * 60 * 60 * 1000;
    
    const oldLogs = await ctx.db
      .query("auditLogs")
      .withIndex("by_timestamp")
      .filter((q) => q.lt(q.field("timestamp"), cutoff))
      .take(500);
    
    let deleted = 0;
    for (const log of oldLogs) {
      await ctx.db.delete(log._id);
      deleted++;
    }
    
    return { deleted, hasMore: oldLogs.length === 500 };
  },
});

/**
 * Helper type for creating audit entries
 */
export interface AuditEntry {
  action: AuditAction;
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, string>;
}
