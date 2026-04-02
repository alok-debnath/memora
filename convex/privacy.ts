/**
 * Privacy consent management
 * Tracks user consent to privacy policies for GDPR/CCPA compliance
 */
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { resolveUser } from "./lib/withAuth";

// Current privacy policy version - update when policy changes
export const CURRENT_PRIVACY_POLICY_VERSION = "1.0.0";

/**
 * Get user's current privacy consent status
 */
export const getConsent = query({
  args: {},
  handler: async (ctx) => {
    const user = await resolveUser(ctx);
    
    const consent = await ctx.db
      .query("privacyConsent")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .first();
    
    if (!consent) {
      return {
        hasConsent: false,
        needsUpdate: true,
        currentVersion: CURRENT_PRIVACY_POLICY_VERSION,
      };
    }
    
    return {
      hasConsent: true,
      needsUpdate: consent.policyVersion !== CURRENT_PRIVACY_POLICY_VERSION,
      currentVersion: CURRENT_PRIVACY_POLICY_VERSION,
      consentedVersion: consent.policyVersion,
      aiProcessingConsent: consent.aiProcessingConsent,
      analyticsConsent: consent.analyticsConsent,
      consentedAt: consent.consentedAt,
    };
  },
});

/**
 * Record user's privacy consent
 */
export const recordConsent = mutation({
  args: {
    policyVersion: v.string(),
    aiProcessingConsent: v.boolean(),
    analyticsConsent: v.boolean(),
    ipHash: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await resolveUser(ctx);
    
    // Insert new consent record (keep history for compliance)
    await ctx.db.insert("privacyConsent", {
      userId: user._id,
      policyVersion: args.policyVersion,
      aiProcessingConsent: args.aiProcessingConsent,
      analyticsConsent: args.analyticsConsent,
      consentedAt: Date.now(),
      ipHash: args.ipHash,
    });
    
    // Log consent in audit trail
    await ctx.db.insert("auditLogs", {
      userId: user._id,
      action: "account.login", // Using existing action type
      resourceType: "privacy_consent",
      resourceId: args.policyVersion,
      metadata: {
        aiConsent: String(args.aiProcessingConsent),
        analyticsConsent: String(args.analyticsConsent),
      },
      timestamp: Date.now(),
    });
    
    return { success: true };
  },
});

/**
 * Withdraw AI processing consent
 * User can opt out of AI features at any time (GDPR right to object)
 */
export const withdrawAiConsent = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await resolveUser(ctx);
    
    const currentConsent = await ctx.db
      .query("privacyConsent")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .first();
    
    if (!currentConsent) {
      throw new Error("No consent record found");
    }
    
    // Record new consent with AI processing disabled
    await ctx.db.insert("privacyConsent", {
      userId: user._id,
      policyVersion: currentConsent.policyVersion,
      aiProcessingConsent: false,
      analyticsConsent: currentConsent.analyticsConsent,
      consentedAt: Date.now(),
    });
    
    return { success: true };
  },
});

/**
 * Get consent history for compliance audits
 */
export const getConsentHistory = query({
  args: {},
  handler: async (ctx) => {
    const user = await resolveUser(ctx);
    
    return await ctx.db
      .query("privacyConsent")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(50);
  },
});
