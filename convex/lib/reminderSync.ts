import type { Doc } from "../_generated/dataModel";

type ReminderLike = Pick<
  Doc<"memories">,
  "status" | "entryKind" | "schedule" | "title" | "content"
>;

export function isSyncableReminder(
  memory: Doc<"memories"> | null | undefined
): memory is Doc<"memories"> & {
  status: "active";
  entryKind: "reminder";
  schedule: NonNullable<Doc<"memories">["schedule"]> & { dueAt: string };
} {
  return !!(
    memory &&
    memory.status === "active" &&
    memory.entryKind === "reminder" &&
    memory.schedule?.dueAt
  );
}

export function buildReminderSyncFingerprint(memory: ReminderLike): string {
  return JSON.stringify({
    title: (memory.title ?? "").trim(),
    content: (memory.content ?? "").trim(),
    dueAt: memory.schedule?.dueAt ?? null,
    isRecurring: memory.schedule?.isRecurring ?? false,
    recurrenceType: memory.schedule?.recurrenceType ?? null,
  });
}
