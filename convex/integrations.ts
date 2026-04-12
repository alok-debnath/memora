import { v } from "convex/values";
import {
  action,
  mutation,
  query,
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { api, internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { resolveUser } from "./lib/withAuth";
import { buildReminderSyncFingerprint, isSyncableReminder } from "./lib/reminderSync";

const googlePlatformValidator = v.union(v.literal("android"), v.literal("ios"), v.literal("web"));

type GooglePlatform = "android" | "ios" | "web";
const GOOGLE_SYNC_LOCK_TTL_MS = 2 * 60 * 1000;

const GOOGLE_SCOPES = {
  calendar: "https://www.googleapis.com/auth/calendar",
  driveFile: "https://www.googleapis.com/auth/drive.file",
} as const;

function hasDriveScope(grantedScopes?: string[]): boolean {
  if (!grantedScopes) return false;
  return grantedScopes.includes(GOOGLE_SCOPES.driveFile);
}

export function buildGoogleOAuthScope(): string {
  return [GOOGLE_SCOPES.calendar, GOOGLE_SCOPES.driveFile].join(" ");
}

function toSearchParams(values: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) {
      params.set(key, value);
    }
  }
  return params;
}

function getGoogleOAuthConfig(platform: GooglePlatform, storedClientId?: string) {
  if (platform === "web") {
    const clientId = storedClientId ?? process.env.GOOGLE_CLIENT_ID_WEB;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET_WEB;

    if (!clientId || !clientSecret) {
      throw new Error("Google web OAuth credentials are not configured on backend.");
    }

    return { clientId, clientSecret };
  }

  const envClientId =
    platform === "android"
      ? process.env.GOOGLE_CLIENT_ID_ANDROID
      : process.env.GOOGLE_CLIENT_ID_IOS;
  const clientId = storedClientId ?? envClientId;

  if (!clientId) {
    throw new Error(`Google ${platform} OAuth client ID is not configured on backend.`);
  }

  return { clientId };
}

/**
 * Check if the user has an active Google Calendar integration.
 */
export const getGoogleIntegration = query({
  args: { token: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await resolveUser(ctx, args.token);
    const integration = await ctx.db
      .query("userIntegrations")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();

    return integration
      ? {
          connected: true,
          email: integration.email,
          updatedAt: integration.updatedAt,
          hasDriveScope: hasDriveScope(integration.grantedScopes),
        }
      : { connected: false, hasDriveScope: false };
  },
});

/**
 * Remove Google Calendar integration.
 */
export const disconnectGoogle = mutation({
  args: { token: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await resolveUser(ctx, args.token);
    const integration = await ctx.db
      .query("userIntegrations")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();

    if (integration) {
      await ctx.db.delete(integration._id);
    }
    return { success: true };
  },
});

/**
 * Manually trigger Google Calendar sync for an existing reminder.
 */
export const triggerReminderSync = mutation({
  args: {
    token: v.optional(v.string()),
    memoryId: v.id("memories"),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    queued: boolean;
    reason:
      | "queued"
      | "in_flight"
      | "already_synced"
      | "not_connected"
      | "not_reminder"
      | "missing_due_at"
      | "not_syncable";
    message: string;
  }> => {
    const user = await resolveUser(ctx, args.token);
    const memory = await ctx.db.get(args.memoryId);

    if (!memory || memory.userId !== user._id) {
      throw new Error("Reminder not found.");
    }

    if (!isSyncableReminder(memory)) {
      const reason = memory.entryKind === "reminder" ? "missing_due_at" : "not_reminder";
      const message =
        reason === "missing_due_at"
          ? "Reminder needs a due date before it can sync to Google Calendar."
          : "Only reminders can sync to Google Calendar.";
      if (memory.entryKind === "reminder") {
        await ctx.db.patch(memory._id, {
          googleSyncStatus: "failed",
          googleSyncMessage: message,
          googleSyncUpdatedAt: Date.now(),
        });
      }
      return { queued: false as const, reason, message };
    }

    const integration = await ctx.db
      .query("userIntegrations")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();

    if (!integration) {
      const message = "Google Calendar is not connected for this account.";
      await ctx.db.patch(memory._id, {
        googleSyncStatus: "failed",
        googleSyncMessage: message,
        googleSyncUpdatedAt: Date.now(),
      });
      return {
        queued: false as const,
        reason: "not_connected" as const,
        message,
      };
    }

    await ctx.db.patch(memory._id, {
      googleSyncFingerprint: undefined,
      googleSyncDesiredFingerprint: undefined,
      googleSyncLockToken: undefined,
      googleSyncLockAt: undefined,
      googleSyncStatus: "pending",
      googleSyncMessage: "Manual sync requested. Syncing reminder to Google Calendar...",
      googleSyncUpdatedAt: Date.now(),
    });

    const queued: {
      queued: boolean;
      reason?: "already_synced" | "in_flight" | "not_syncable";
    } = await ctx.runMutation(internal.integrations.queueReminderSync, {
      memoryId: memory._id,
      pendingMessage: "Manual sync requested. Syncing reminder to Google Calendar...",
    });

    if (queued.queued) {
      return {
        queued: true as const,
        reason: queued.reason ?? "queued",
        message:
          queued.reason === "in_flight"
            ? "Reminder sync is already in progress."
            : "Reminder sync has been queued.",
      };
    }

    if (queued.reason === "already_synced") {
      const message = "Reminder is already synced to Google Calendar.";
      await ctx.db.patch(memory._id, {
        googleSyncStatus: "synced",
        googleSyncMessage: message,
        googleSyncUpdatedAt: Date.now(),
      });
      return {
        queued: false as const,
        reason: "already_synced" as const,
        message,
      };
    }

    return {
      queued: false as const,
      reason: queued.reason ?? "not_syncable",
      message: "Reminder could not be queued for Google Calendar sync.",
    };
  },
});

/**
 * Remove Google Calendar sync linkage for a reminder and clean up linked events.
 */
export const removeReminderSync = mutation({
  args: {
    token: v.optional(v.string()),
    memoryId: v.id("memories"),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    removed: boolean;
    reason: "removed" | "not_reminder";
    message: string;
    hadGoogleEvent: boolean;
  }> => {
    const user = await resolveUser(ctx, args.token);
    const memory = await ctx.db.get(args.memoryId);

    if (!memory || memory.userId !== user._id) {
      throw new Error("Reminder not found.");
    }

    if (memory.entryKind !== "reminder") {
      return {
        removed: false,
        reason: "not_reminder",
        message: "Only reminders support Google Calendar sync removal.",
        hadGoogleEvent: false,
      };
    }

    const now = Date.now();
    const cancellationLockToken = `manual_unsync_${crypto.randomUUID()}`;
    const hadGoogleEvent = !!memory.googleEventId;

    await ctx.db.patch(memory._id, {
      googleEventId: undefined,
      googleSyncStatus: undefined,
      googleSyncMessage: undefined,
      googleSyncUpdatedAt: now,
      googleSyncLockToken: cancellationLockToken,
      googleSyncLockAt: now,
      googleSyncFingerprint: undefined,
      googleSyncDesiredFingerprint: undefined,
    });

    if (memory.googleEventId) {
      await ctx.scheduler.runAfter(0, internal.integrations.deleteGoogleEvent, {
        userId: user._id,
        googleEventId: memory.googleEventId,
      });
    }

    // Delete by memory linkage too, so we remove duplicates and race-created events.
    await ctx.scheduler.runAfter(0, internal.integrations.deleteGoogleEventsForMemory, {
      userId: user._id,
      memoryId: memory._id,
    });
    await ctx.scheduler.runAfter(5_000, internal.integrations.deleteGoogleEventsForMemory, {
      userId: user._id,
      memoryId: memory._id,
    });

    // Release the temporary cancellation lock after short delay to avoid
    // immediate re-queue races from already scheduled sync jobs.
    await ctx.scheduler.runAfter(15_000, internal.integrations.releaseReminderSyncLock, {
      memoryId: memory._id,
      lockToken: cancellationLockToken,
    });

    return {
      removed: true,
      reason: "removed",
      message: hadGoogleEvent
        ? "Removed Google Calendar sync and deleted linked calendar event(s)."
        : "Cleared Google Calendar sync metadata for this reminder.",
      hadGoogleEvent,
    };
  },
});

/**
 * Internal mutation to save Google OAuth credentials.
 */
export const saveGoogleCredentials = internalMutation({
  args: {
    userId: v.id("users"),
    refreshToken: v.string(),
    email: v.optional(v.string()),
    clientId: v.optional(v.string()),
    platform: v.optional(googlePlatformValidator),
    grantedScopes: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("userIntegrations")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        refreshToken: args.refreshToken,
        email: args.email,
        clientId: args.clientId,
        platform: args.platform,
        grantedScopes: args.grantedScopes ?? existing.grantedScopes,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("userIntegrations", {
        userId: args.userId,
        provider: "google",
        refreshToken: args.refreshToken,
        email: args.email,
        clientId: args.clientId,
        platform: args.platform,
        grantedScopes: args.grantedScopes,
        createdAt: now,
        updatedAt: now,
      });
    }
  },
});

/**
 * Action to exchange authorization code for refresh token.
 */
export const connectGoogle = action({
  args: {
    token: v.optional(v.string()),
    code: v.string(),
    codeVerifier: v.optional(v.string()),
    platform: googlePlatformValidator,
    redirectUri: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.runQuery(api.auth.me, { token: args.token });
    if (!user) {
      throw new Error("Not authenticated");
    }
    const { clientId, clientSecret } = getGoogleOAuthConfig(args.platform);

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: toSearchParams({
        code: args.code,
        client_id: clientId,
        client_secret: clientSecret,
        code_verifier: args.codeVerifier,
        redirect_uri: args.redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error("Google Token Exchange Error:", data);
      throw new Error(`Failed to exchange code: ${data.error_description || data.error}`);
    }

    // Parse granted scopes from token response
    const grantedScopes: string[] | undefined =
      typeof data.scope === "string" ? data.scope.split(" ").filter(Boolean) : undefined;

    // refresh_token is only returned on the first time or if prompt=consent was used
    if (!data.refresh_token) {
      // Check if we already have one
      const existing = await ctx.runQuery(api.integrations.getGoogleIntegration, {
        token: args.token,
      });
      if (!existing.connected) {
        throw new Error("No refresh token returned. Try disconnecting and reconnecting.");
      }
      // Update scopes even if no new refresh token
      if (grantedScopes) {
        await ctx.runMutation(internal.integrations.updateGrantedScopes, {
          userId: user._id,
          grantedScopes,
        });
      }
    } else {
      await ctx.runMutation(internal.integrations.saveGoogleCredentials, {
        userId: user._id,
        refreshToken: data.refresh_token,
        email: "",
        clientId,
        platform: args.platform,
        grantedScopes,
      });
    }

    return { success: true, grantedScopes };
  },
});

/**
 * Internal helper to get a fresh access token using a refresh token.
 */
async function getAccessToken({
  refreshToken,
  clientId: storedClientId,
  platform,
}: {
  refreshToken: string;
  clientId?: string;
  platform?: GooglePlatform;
}) {
  const { clientId, clientSecret } = getGoogleOAuthConfig(platform ?? "web", storedClientId);

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: toSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
  });

  const data = await response.json();
  if (!response.ok) throw new Error("Failed to refresh Google access token");
  return data.access_token as string;
}

async function deleteGoogleCalendarEventById(args: { accessToken: string; googleEventId: string }) {
  await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${args.googleEventId}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${args.accessToken}` },
    },
  );
}

async function findGoogleEventsByMemoryId(args: { accessToken: string; memoryId: string }) {
  const params = new URLSearchParams({
    singleEvents: "true",
    maxResults: "10",
    privateExtendedProperty: `memoraMemoryId=${args.memoryId}`,
  });
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`,
    {
      headers: { Authorization: `Bearer ${args.accessToken}` },
    },
  );
  if (!response.ok) {
    return [] as string[];
  }
  const payload = (await response.json()) as { items?: Array<{ id?: string }> };
  return (payload.items ?? [])
    .map((item) => item.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
}

async function fetchDrivePreviewUrl(args: {
  accessToken: string;
  fileId: string;
}): Promise<string | null> {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${args.fileId}?fields=thumbnailLink`,
    {
      headers: { Authorization: `Bearer ${args.accessToken}` },
    },
  );

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as { thumbnailLink?: string };
  return typeof payload.thumbnailLink === "string" && payload.thumbnailLink.length > 0
    ? payload.thumbnailLink
    : null;
}

export const queueReminderSync = internalMutation({
  args: {
    memoryId: v.id("memories"),
    pendingMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const memory = await ctx.db.get(args.memoryId);
    if (!isSyncableReminder(memory)) {
      return { queued: false, reason: "not_syncable" as const };
    }

    const desiredFingerprint = buildReminderSyncFingerprint(memory);
    const now = Date.now();
    const hasFreshLock =
      !!memory.googleSyncLockToken &&
      !!memory.googleSyncLockAt &&
      now - memory.googleSyncLockAt < GOOGLE_SYNC_LOCK_TTL_MS;

    if (
      memory.googleSyncFingerprint === desiredFingerprint &&
      memory.googleSyncStatus === "synced" &&
      memory.googleEventId
    ) {
      return { queued: false, reason: "already_synced" as const };
    }

    if (hasFreshLock) {
      if (memory.googleSyncDesiredFingerprint !== desiredFingerprint) {
        await ctx.db.patch(args.memoryId, {
          googleSyncDesiredFingerprint: desiredFingerprint,
          googleSyncStatus: "pending",
          googleSyncMessage:
            args.pendingMessage ?? "Reminder updated. Syncing changes to Google Calendar...",
          googleSyncUpdatedAt: now,
        });
      }
      return { queued: true as const, reason: "in_flight" as const };
    }

    await ctx.db.patch(args.memoryId, {
      googleSyncStatus: "pending",
      googleSyncMessage:
        args.pendingMessage ?? "Reminder updated. Syncing changes to Google Calendar...",
      googleSyncUpdatedAt: now,
      googleSyncDesiredFingerprint: desiredFingerprint,
    });
    await ctx.scheduler.runAfter(0, internal.integrations.syncReminderToGoogle, {
      memoryId: args.memoryId,
    });

    return { queued: true as const };
  },
});

export const releaseReminderSyncLock = internalMutation({
  args: {
    memoryId: v.id("memories"),
    lockToken: v.string(),
  },
  handler: async (ctx, args) => {
    const memory = await ctx.db.get(args.memoryId);
    if (!memory) {
      return { released: false as const, reason: "not_found" as const };
    }
    if (memory.googleSyncLockToken !== args.lockToken) {
      return { released: false as const, reason: "lock_mismatch" as const };
    }
    await ctx.db.patch(args.memoryId, {
      googleSyncLockToken: undefined,
      googleSyncLockAt: undefined,
    });
    return { released: true as const };
  },
});

export const acquireReminderSyncLock = internalMutation({
  args: {
    memoryId: v.id("memories"),
  },
  handler: async (ctx, args) => {
    const memory = await ctx.db.get(args.memoryId);
    if (!isSyncableReminder(memory)) {
      return { state: "skip" as const };
    }

    const desiredFingerprint = buildReminderSyncFingerprint(memory);
    const now = Date.now();
    const hasFreshLock =
      !!memory.googleSyncLockToken &&
      !!memory.googleSyncLockAt &&
      now - memory.googleSyncLockAt < GOOGLE_SYNC_LOCK_TTL_MS;

    if (
      memory.googleSyncFingerprint === desiredFingerprint &&
      memory.googleSyncStatus === "synced" &&
      memory.googleEventId &&
      !hasFreshLock
    ) {
      if (memory.googleSyncDesiredFingerprint !== desiredFingerprint) {
        await ctx.db.patch(args.memoryId, {
          googleSyncDesiredFingerprint: desiredFingerprint,
        });
      }
      return { state: "up_to_date" as const };
    }

    if (hasFreshLock) {
      if (memory.googleSyncDesiredFingerprint !== desiredFingerprint) {
        await ctx.db.patch(args.memoryId, {
          googleSyncDesiredFingerprint: desiredFingerprint,
          googleSyncUpdatedAt: now,
        });
      }
      return { state: "locked" as const };
    }

    const lockToken = crypto.randomUUID();
    await ctx.db.patch(args.memoryId, {
      googleSyncLockToken: lockToken,
      googleSyncLockAt: now,
      googleSyncDesiredFingerprint: desiredFingerprint,
      googleSyncStatus: "pending",
      googleSyncMessage: "Syncing reminder to Google Calendar...",
      googleSyncUpdatedAt: now,
    });

    return {
      state: "ready" as const,
      lockToken,
      desiredFingerprint,
      userId: memory.userId,
      existingGoogleEventId: memory.googleEventId,
      title: memory.title || "Memora Reminder",
      content: memory.content || "",
      dueAt: memory.schedule.dueAt,
    };
  },
});

export const finalizeReminderSyncLock = internalMutation({
  args: {
    memoryId: v.id("memories"),
    lockToken: v.string(),
    result: v.union(v.literal("synced"), v.literal("failed")),
    message: v.optional(v.string()),
    googleEventId: v.optional(v.string()),
    syncedFingerprint: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const memory = await ctx.db.get(args.memoryId);
    if (!memory) {
      return {
        finalized: false,
        cleanupGoogleEvent: args.result === "synced" && !!args.googleEventId,
      };
    }

    if (memory.googleSyncLockToken !== args.lockToken) {
      return { finalized: false, cleanupGoogleEvent: false };
    }

    const now = Date.now();
    const releasePatch = {
      googleSyncLockToken: undefined,
      googleSyncLockAt: undefined,
    };

    if (args.result === "failed") {
      if (isSyncableReminder(memory)) {
        await ctx.db.patch(args.memoryId, {
          ...releasePatch,
          googleSyncStatus: "failed",
          googleSyncMessage: args.message ?? "Google Calendar sync failed.",
          googleSyncUpdatedAt: now,
        });
      } else {
        await ctx.db.patch(args.memoryId, releasePatch);
      }
      return { finalized: true, cleanupGoogleEvent: false };
    }

    if (!isSyncableReminder(memory)) {
      await ctx.db.patch(args.memoryId, releasePatch);
      return { finalized: true, cleanupGoogleEvent: true };
    }

    const syncedFingerprint = args.syncedFingerprint ?? buildReminderSyncFingerprint(memory);
    const desiredFingerprint = memory.googleSyncDesiredFingerprint ?? syncedFingerprint;
    const needsResync = desiredFingerprint !== syncedFingerprint;

    await ctx.db.patch(args.memoryId, {
      ...releasePatch,
      googleEventId: args.googleEventId ?? memory.googleEventId,
      googleSyncFingerprint: syncedFingerprint,
      googleSyncStatus: needsResync ? "pending" : "synced",
      googleSyncMessage: needsResync
        ? "Reminder changed while syncing. Retrying with latest details..."
        : args.message,
      googleSyncUpdatedAt: now,
    });

    if (needsResync) {
      await ctx.scheduler.runAfter(0, internal.integrations.syncReminderToGoogle, {
        memoryId: args.memoryId,
      });
    }

    return {
      finalized: true,
      cleanupGoogleEvent: false,
      resyncScheduled: needsResync,
    };
  },
});

/**
 * Sync a Memora reminder to Google Calendar.
 */
export const syncReminderToGoogle = internalAction({
  args: { memoryId: v.id("memories") },
  handler: async (ctx, args) => {
    let lockToken: string | null = null;
    try {
      const acquisition = await ctx.runMutation(internal.integrations.acquireReminderSyncLock, {
        memoryId: args.memoryId,
      });
      if (acquisition.state !== "ready") {
        return;
      }
      lockToken = acquisition.lockToken;

      const integration = await ctx.runQuery(internal.integrations.getGoogleIntegrationInternal, {
        userId: acquisition.userId,
      });
      if (!integration) {
        await ctx.runMutation(internal.integrations.finalizeReminderSyncLock, {
          memoryId: args.memoryId,
          lockToken,
          result: "failed",
          message: "Google Calendar is not connected for this account.",
        });
        return;
      }

      const accessToken = await getAccessToken({
        refreshToken: integration.refreshToken,
        clientId: integration.clientId,
        platform: integration.platform,
      });

      let existingGoogleEventId = acquisition.existingGoogleEventId;
      if (!existingGoogleEventId) {
        const linkedEventIds = await findGoogleEventsByMemoryId({
          accessToken,
          memoryId: String(args.memoryId),
        });
        if (linkedEventIds.length > 0) {
          existingGoogleEventId = linkedEventIds[0];
          for (const duplicateEventId of linkedEventIds.slice(1)) {
            try {
              await deleteGoogleCalendarEventById({
                accessToken,
                googleEventId: duplicateEventId,
              });
            } catch (cleanupError) {
              console.error("GCal Duplicate Cleanup Error:", cleanupError);
            }
          }
        }
      }

      const eventBody = {
        summary: acquisition.title,
        description: acquisition.content,
        start: { dateTime: new Date(acquisition.dueAt).toISOString() },
        end: {
          dateTime: new Date(new Date(acquisition.dueAt).getTime() + 30 * 60 * 1000).toISOString(),
        },
        reminders: { useDefault: true },
        extendedProperties: {
          private: {
            memoraMemoryId: String(args.memoryId),
          },
        },
      };

      let response;
      if (existingGoogleEventId) {
        response = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events/${existingGoogleEventId}`,
          {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(eventBody),
          },
        );
      } else {
        response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(eventBody),
        });
      }

      let data: any = null;
      try {
        data = await response.json();
      } catch {
        data = null;
      }

      const resolvedGoogleEventId =
        typeof data?.id === "string" && data.id.length > 0 ? data.id : existingGoogleEventId;

      if (response.ok && resolvedGoogleEventId) {
        const finalized = await ctx.runMutation(internal.integrations.finalizeReminderSyncLock, {
          memoryId: args.memoryId,
          lockToken,
          result: "synced",
          message: existingGoogleEventId
            ? "Google Calendar event updated."
            : "Google Calendar event created.",
          googleEventId: resolvedGoogleEventId,
          syncedFingerprint: acquisition.desiredFingerprint,
        });

        if (finalized.cleanupGoogleEvent && !existingGoogleEventId) {
          try {
            await deleteGoogleCalendarEventById({
              accessToken,
              googleEventId: resolvedGoogleEventId,
            });
          } catch (cleanupError) {
            console.error("GCal Sync Cleanup Error:", cleanupError);
          }
        }
      } else {
        const errorMessage =
          data?.error?.message ||
          data?.error_description ||
          data?.error ||
          `Google Calendar rejected the event request (HTTP ${response.status}).`;
        await ctx.runMutation(internal.integrations.finalizeReminderSyncLock, {
          memoryId: args.memoryId,
          lockToken,
          result: "failed",
          message: String(errorMessage),
        });
        console.error("GCal Sync Error:", data);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown Google Calendar sync error.";
      if (lockToken) {
        await ctx.runMutation(internal.integrations.finalizeReminderSyncLock, {
          memoryId: args.memoryId,
          lockToken,
          result: "failed",
          message: errorMessage,
        });
      }
      console.error("GCal Sync Error:", error);
    }
  },
});

/**
 * Delete a Google Calendar event when the corresponding reminder is deleted.
 */
export const deleteGoogleEvent = internalAction({
  args: {
    userId: v.id("users"),
    googleEventId: v.string(),
  },
  handler: async (ctx, args) => {
    const integration = await ctx.runQuery(internal.integrations.getGoogleIntegrationInternal, {
      userId: args.userId,
    });
    if (!integration) return;

    const accessToken = await getAccessToken({
      refreshToken: integration.refreshToken,
      clientId: integration.clientId,
      platform: integration.platform,
    });

    await deleteGoogleCalendarEventById({
      accessToken,
      googleEventId: args.googleEventId,
    });
  },
});

export const deleteGoogleEventsForMemory = internalAction({
  args: {
    userId: v.id("users"),
    memoryId: v.id("memories"),
  },
  handler: async (ctx, args) => {
    const integration = await ctx.runQuery(internal.integrations.getGoogleIntegrationInternal, {
      userId: args.userId,
    });
    if (!integration) {
      return { deleted: 0 };
    }

    const accessToken = await getAccessToken({
      refreshToken: integration.refreshToken,
      clientId: integration.clientId,
      platform: integration.platform,
    });

    const linkedEventIds = await findGoogleEventsByMemoryId({
      accessToken,
      memoryId: String(args.memoryId),
    });

    for (const eventId of linkedEventIds) {
      try {
        await deleteGoogleCalendarEventById({
          accessToken,
          googleEventId: eventId,
        });
      } catch (error) {
        console.error("GCal Bulk Delete Error:", error);
      }
    }

    return { deleted: linkedEventIds.length };
  },
});

/**
 * Internal query to fetch integration for sync actions.
 */
export const getGoogleIntegrationInternal = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("userIntegrations")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();
  },
});

/**
 * Internal mutation to update only the grantedScopes without changing the refresh token.
 */
export const updateGrantedScopes = internalMutation({
  args: {
    userId: v.id("users"),
    grantedScopes: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("userIntegrations")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        grantedScopes: args.grantedScopes,
        updatedAt: Date.now(),
      });
    }
  },
});

/**
 * Internal mutation to cache Drive folder IDs on the integration record.
 */
export const saveDriveFolderIds = internalMutation({
  args: {
    userId: v.id("users"),
    driveFolderId: v.string(),
    driveMonthFolderId: v.string(),
    driveMonthFolderKey: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("userIntegrations")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        driveFolderId: args.driveFolderId,
        driveMonthFolderId: args.driveMonthFolderId,
        driveMonthFolderKey: args.driveMonthFolderKey,
        updatedAt: Date.now(),
      });
    }
  },
});

/**
 * Find or create the Memora root folder and a YYYY-MM subfolder in Google Drive.
 * Returns the month folder ID to use for uploads.
 */
export const ensureMemoraFolder = internalAction({
  args: {
    userId: v.id("users"),
    accessToken: v.string(),
  },
  handler: async (ctx, args): Promise<{ rootFolderId: string; monthFolderId: string }> => {
    const integration = await ctx.runQuery(internal.integrations.getGoogleIntegrationInternal, {
      userId: args.userId,
    });

    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    // Return cached folder IDs if still valid for this month
    if (
      integration?.driveFolderId &&
      integration.driveMonthFolderId &&
      integration.driveMonthFolderKey === monthKey
    ) {
      return {
        rootFolderId: integration.driveFolderId,
        monthFolderId: integration.driveMonthFolderId,
      };
    }

    // Find or create the "Memora" root folder
    let rootFolderId = integration?.driveFolderId;

    if (!rootFolderId) {
      // Search for existing Memora folder
      const searchRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
          "name='Memora' and mimeType='application/vnd.google-apps.folder' and trashed=false",
        )}&fields=files(id,name)`,
        { headers: { Authorization: `Bearer ${args.accessToken}` } },
      );
      if (!searchRes.ok) {
        const body = await searchRes.text();
        throw new Error(`Drive folder search failed (${searchRes.status}): ${body}`);
      }
      const searchData = (await searchRes.json()) as {
        files?: Array<{ id: string }>;
      };
      if (searchData.files && searchData.files.length > 0) {
        rootFolderId = searchData.files[0].id;
      } else {
        // Create it
        const createRes = await fetch("https://www.googleapis.com/drive/v3/files?fields=id", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${args.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: "Memora",
            mimeType: "application/vnd.google-apps.folder",
          }),
        });
        if (!createRes.ok) {
          const body = await createRes.text();
          throw new Error(`Drive folder creation failed (${createRes.status}): ${body}`);
        }
        const createData = (await createRes.json()) as { id?: string };
        if (!createData.id) throw new Error("Drive folder creation returned no ID");
        rootFolderId = createData.id;
      }
    }

    if (!rootFolderId) throw new Error("Could not resolve Memora root folder ID");

    // Find or create the month subfolder
    const monthSearchRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
        `name='${monthKey}' and mimeType='application/vnd.google-apps.folder' and '${rootFolderId}' in parents and trashed=false`,
      )}&fields=files(id,name)`,
      { headers: { Authorization: `Bearer ${args.accessToken}` } },
    );
    if (!monthSearchRes.ok) {
      const body = await monthSearchRes.text();
      throw new Error(`Drive month-folder search failed (${monthSearchRes.status}): ${body}`);
    }
    const monthSearchData = (await monthSearchRes.json()) as {
      files?: Array<{ id: string }>;
    };

    let monthFolderId: string;
    if (monthSearchData.files && monthSearchData.files.length > 0) {
      monthFolderId = monthSearchData.files[0].id;
    } else {
      const createMonthRes = await fetch("https://www.googleapis.com/drive/v3/files?fields=id", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${args.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: monthKey,
          mimeType: "application/vnd.google-apps.folder",
          parents: [rootFolderId],
        }),
      });
      if (!createMonthRes.ok) {
        const body = await createMonthRes.text();
        throw new Error(`Drive month-folder creation failed (${createMonthRes.status}): ${body}`);
      }
      const createMonthData = (await createMonthRes.json()) as { id?: string };
      if (!createMonthData.id) throw new Error("Drive month-folder creation returned no ID");
      monthFolderId = createMonthData.id;
    }

    // Cache the folder IDs
    await ctx.runMutation(internal.integrations.saveDriveFolderIds, {
      userId: args.userId,
      driveFolderId: rootFolderId,
      driveMonthFolderId: monthFolderId,
      driveMonthFolderKey: monthKey,
    });

    return { rootFolderId, monthFolderId };
  },
});

/**
 * Public action: returns a short-lived Drive access token and folder ID for client-side upload.
 * Throws DRIVE_SCOPE_MISSING if the user hasn't granted drive.file access.
 */
export const getDriveUploadCredentials = action({
  args: { token: v.optional(v.string()) },
  handler: async (ctx, args): Promise<{ accessToken: string; folderId: string }> => {
    const user = await ctx.runQuery(api.auth.me, { token: args.token });
    if (!user) throw new Error("Not authenticated");

    const integration = await ctx.runQuery(internal.integrations.getGoogleIntegrationInternal, {
      userId: user._id,
    });
    if (!integration) throw new Error("GOOGLE_NOT_CONNECTED");
    if (!hasDriveScope(integration.grantedScopes)) throw new Error("DRIVE_SCOPE_MISSING");

    const accessToken = await getAccessToken({
      refreshToken: integration.refreshToken,
      clientId: integration.clientId,
      platform: integration.platform,
    });

    const { monthFolderId } = await ctx.runAction(internal.integrations.ensureMemoraFolder, {
      userId: user._id,
      accessToken,
    });

    return { accessToken, folderId: monthFolderId };
  },
});

/**
 * Public action: returns fresh Google Drive preview URLs for image attachments.
 * These URLs are transient and should be cached client-side for a short time,
 * not stored as the canonical attachment preview source.
 */
export const getDrivePreviewUrls = action({
  args: {
    token: v.optional(v.string()),
    fileIds: v.array(v.string()),
  },
  handler: async (ctx, args): Promise<Record<string, string>> => {
    const dedupedFileIds = [...new Set(args.fileIds)].filter((id) => id.length > 0).slice(0, 100);
    if (dedupedFileIds.length === 0) {
      return {};
    }

    const user = await ctx.runQuery(api.auth.me, { token: args.token });
    if (!user) throw new Error("Not authenticated");

    const integration = await ctx.runQuery(internal.integrations.getGoogleIntegrationInternal, {
      userId: user._id,
    });
    if (!integration) throw new Error("GOOGLE_NOT_CONNECTED");
    if (!hasDriveScope(integration.grantedScopes)) throw new Error("DRIVE_SCOPE_MISSING");

    const accessToken = await getAccessToken({
      refreshToken: integration.refreshToken,
      clientId: integration.clientId,
      platform: integration.platform,
    });

    const settled = await Promise.allSettled(
      dedupedFileIds.map(async (fileId) => ({
        fileId,
        previewUrl: await fetchDrivePreviewUrl({ accessToken, fileId }),
      })),
    );

    const previews: Record<string, string> = {};
    for (const result of settled) {
      if (result.status !== "fulfilled") continue;
      if (result.value.previewUrl) {
        previews[result.value.fileId] = result.value.previewUrl;
      }
    }
    return previews;
  },
});

/**
 * Internal action: delete a file from Google Drive.
 */
export const deleteDriveFile = internalAction({
  args: {
    userId: v.id("users"),
    driveFileId: v.string(),
  },
  handler: async (ctx, args) => {
    const integration = await ctx.runQuery(internal.integrations.getGoogleIntegrationInternal, {
      userId: args.userId,
    });
    if (!integration) return;

    const accessToken = await getAccessToken({
      refreshToken: integration.refreshToken,
      clientId: integration.clientId,
      platform: integration.platform,
    });

    await fetch(`https://www.googleapis.com/drive/v3/files/${args.driveFileId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  },
});
