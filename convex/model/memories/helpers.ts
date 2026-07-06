import type { MutationCtx, QueryCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";

/**
 * True when a memory should appear in active/live views.
 */
export function isActiveMemory(m: { status: string }): boolean {
  return m.status === "active";
}

export async function getGoogleIntegrationForUser(
  ctx: MutationCtx | QueryCtx,
  userId: Id<"users">,
) {
  return await ctx.db
    .query("userIntegrations")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
}

export function isCalendarSyncEnabled(
  integration?: {
    grantedScopes?: string[];
    calendarEnabled?: boolean;
  } | null,
) {
  if (!integration) return false;
  const grantedScopes = integration.grantedScopes ?? [];
  const hasCalendarScope =
    grantedScopes.includes("https://www.googleapis.com/auth/calendar") ||
    grantedScopes.includes("https://www.googleapis.com/auth/calendar.events");
  return hasCalendarScope && integration.calendarEnabled !== false;
}

export function hasSchedulingInput(value: {
  entryKind?: "memory" | "reminder" | null;
  schedule?: unknown;
}) {
  return value.entryKind !== undefined || value.schedule !== undefined;
}

export function isSameValue(left: unknown, right: unknown) {
  if (left === right) {
    return true;
  }
  if (left === undefined || right === undefined) {
    return left === right;
  }
  return JSON.stringify(left) === JSON.stringify(right);
}
