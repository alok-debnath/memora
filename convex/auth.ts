import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex, crossDomain } from "@convex-dev/better-auth/plugins";
import { expo } from "@better-auth/expo";
import { betterAuth } from "better-auth";
import { v } from "convex/values";
import { api, components, internal } from "./_generated/api";
import { DataModel } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import authConfig from "./auth.config";
import { resolveUser } from "./lib/withAuth";

export const authComponent = createClient<DataModel>(components.betterAuth);
export const { getAuthUser } = authComponent.clientApi();

const appScheme = "memora://";
const fallbackSiteUrl = "http://localhost:8081";

async function sendResetPasswordEmail(email: string, url: string) {
  const resendApiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.BETTER_AUTH_FROM_EMAIL;

  if (!resendApiKey || !fromEmail) {
    console.log(`Password reset for ${email}: ${url}`);
    return;
  }

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: email,
      subject: "Reset your Memora password",
      html: `<p>Reset your Memora password by opening this link:</p><p><a href="${url}">${url}</a></p>`,
    }),
  });
}

export const createAuth = (ctx: GenericCtx<DataModel>) => {
  const siteUrl = process.env.SITE_URL ?? fallbackSiteUrl;

  return betterAuth({
    trustedOrigins: [siteUrl, appScheme],
    baseURL: process.env.EXPO_PUBLIC_CONVEX_SITE_URL,
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      minPasswordLength: 8,
      sendResetPassword: async ({ user, url }) => {
        await sendResetPasswordEmail(user.email, url);
      },
    },
    user: {
      additionalFields: {
        userId: {
          type: "string",
          required: false,
          input: false,
        },
      },
    },
    plugins: [expo(), convex({ authConfig }), crossDomain({ siteUrl })],
  });
};

export const me = query({
  args: { token: v.optional(v.string()) },
  handler: async (ctx) => {
    try {
      const user = await resolveUser(ctx);
      return {
        _id: user._id,
        email: user.email,
        name: user.name,
        timezone: user.timezone ?? "UTC",
      };
    } catch {
      return null;
    }
  },
});

export const syncSessionUser = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const email = identity.email ?? "";
    const name = identity.name ?? email.split("@")[0] ?? "Memora User";
    const tokenIdentifier = identity.tokenIdentifier;
    let user = await ctx.db
      .query("users")
      .withIndex("by_token_identifier", (q) => q.eq("tokenIdentifier", tokenIdentifier))
      .unique();

    if (!user) {
      const userId = await ctx.db.insert("users", {
        tokenIdentifier,
        authUserId: identity.subject,
        email,
        name,
        userType: "user",
        analyticsSubjectId: `subj_${Date.now().toString(36)}`,
        timezone: "UTC",
      });

      await ctx.db.insert("notificationPreferences", {
        userId,
        dailyReview: true,
        weeklyDigest: true,
        memoryNudges: true,
        capsuleAlerts: true,
        pushEnabled: true,
      });

      await ctx.db.insert("nudges", {
        userId,
        title: "Start journaling",
        message: "Capture your first memory to get started with Memora",
        nudgeType: "onboarding",
        priority: "high",
        isDismissed: false,
        isActedOn: false,
      });

      await ctx.db.insert("userMemoryStats", {
        userId,
        totalMemories: 0,
        totalReminders: 0,
        recurringCount: 0,
        updatedAt: Date.now(),
      });
      await ctx.runMutation(internal.analytics.ensureUserSummary, {
        userId,
      });

      user = await ctx.db.get(userId);
    } else if (
      user.email !== email ||
      user.name !== name ||
      user.authUserId !== identity.subject ||
      !user.analyticsSubjectId ||
      !user.userType ||
      user.deletedAt
    ) {
      await ctx.db.patch(user._id, {
        email,
        name,
        authUserId: identity.subject,
        userType: user.userType ?? "user",
        analyticsSubjectId: user.analyticsSubjectId ?? `subj_${user._id}`,
        deletedAt: undefined,
        anonymizedAt: undefined,
      });
      user = await ctx.db.get(user._id);
    }

    if (!user) {
      throw new Error("Failed to sync user profile");
    }

    return {
      _id: user._id,
      email: user.email,
      name: user.name,
      timezone: user.timezone ?? "UTC",
    };
  },
});

export const deleteAccount = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await resolveUser(ctx);
    const BATCH = 200;
    let hasMore = false;

    // Delete from child tables in batches. Analytics is retained.
    const tables = [
      "memoryAttachments",
      "memoryHistory",
      "notificationPreferences",
      "diaryEntries",
      "reviewCards",
      "nudges",
      "chatMessages",
      "userMemoryStats",
      "userMemoryDailyCounts",
    ] as const;

    for (const table of tables) {
      const docs = await ctx.db
        .query(table)
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .take(BATCH);
      for (const doc of docs) {
        await ctx.db.delete(doc._id);
      }
      if (docs.length >= BATCH) hasMore = true;
    }

    const shares = await ctx.db
      .query("sharedMemories")
      .withIndex("by_user", (q) => q.eq("sharedByUserId", user._id))
      .take(BATCH);
    for (const share of shares) {
      await ctx.db.delete(share._id);
    }
    if (shares.length >= BATCH) hasMore = true;

    const memories = await ctx.db
      .query("memories")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .take(BATCH);
    for (const memory of memories) {
      await ctx.db.delete(memory._id);
    }
    if (memories.length >= BATCH) hasMore = true;

    const appUserId = String(user._id);
    const authUserId = user.authUserId;
    const authUsers = await ctx.db
      .query("authUsers")
      .withIndex("userId", (q) => q.eq("userId", appUserId))
      .take(BATCH);
    for (const authUser of authUsers) {
      await ctx.db.delete(authUser._id);
    }
    if (authUsers.length >= BATCH) hasMore = true;

    if (authUserId) {
      const authLinkedTables = [
        "authSessions",
        "authAccounts",
        "authTwoFactor",
        "authOauthAccessTokens",
        "authOauthConsents",
      ] as const;
      for (const table of authLinkedTables) {
        const docs = await ctx.db
          .query(table)
          .withIndex("userId", (q) => q.eq("userId", authUserId))
          .take(BATCH);
        for (const doc of docs) {
          await ctx.db.delete(doc._id);
        }
        if (docs.length >= BATCH) hasMore = true;
      }
    }

    if (hasMore) {
      // More data to delete — schedule another pass
      await ctx.scheduler.runAfter(0, api.auth.deleteAccount, {});
      return { success: false, message: "Deletion in progress" };
    }

    const anonymizedAt = Date.now();
    await ctx.db.patch(user._id, {
      tokenIdentifier: undefined,
      authUserId: undefined,
      email: `deleted+${user._id}@memora.local`,
      name: "Deleted user",
      avatarUrl: undefined,
      passwordHash: undefined,
      preferences: undefined,
      analyticsSubjectId: user.analyticsSubjectId ?? `subj_${user._id}`,
      deletedAt: anonymizedAt,
      anonymizedAt,
    });
    return { success: true };
  },
});

export const updateProfile = mutation({
  args: {
    name: v.optional(v.string()),
    timezone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await resolveUser(ctx);

    const patch: { name?: string; timezone?: string } = {};
    if (args.name !== undefined) {
      patch.name = args.name.trim() || user.name;
    }
    if (args.timezone !== undefined) {
      patch.timezone = args.timezone.trim() || "UTC";
    }

    await ctx.db.patch(user._id, patch);
    const updated = await ctx.db.get(user._id);
    if (!updated) {
      throw new Error("Failed to update profile");
    }
    return {
      _id: updated._id,
      email: updated.email,
      name: updated.name,
      timezone: updated.timezone ?? "UTC",
    };
  },
});
