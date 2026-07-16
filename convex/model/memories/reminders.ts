import type { Doc, Id } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";
import { isReminder } from "../../lib/memoryKind";

export async function listDueReminders(
  ctx: QueryCtx,
  args: {
    userId: Id<"users">;
    asOf: string;
    limit: number;
  },
): Promise<Doc<"memories">[]> {
  const rows = await ctx.db
    .query("memories")
    .withIndex("by_user_status_entryKind_nextDueAt", (q) =>
      q
        .eq("userId", args.userId)
        .eq("status", "active")
        .eq("entryKind", "reminder")
        .gt("nextDueAt", "")
        .lte("nextDueAt", args.asOf),
    )
    .order("desc")
    .take(args.limit);

  // Keep malformed legacy rows from ever reaching reminder UI.
  return rows.filter(isReminder);
}
