import type { Doc } from "../_generated/dataModel";

export type MemoryEntryKind = "memory" | "reminder";
export type MemoryRecurrenceType = "daily" | "weekly" | "monthly" | "yearly";

export type MemorySchedule = {
  dueAt: string;
  isRecurring: boolean;
  recurrenceType?: MemoryRecurrenceType;
};

export type MemoryEmbeddingState = "missing" | "ready";

type MemoryLike = {
  entryKind?: MemoryEntryKind;
  schedule?: MemorySchedule;
  embedding?: number[] | null;
};

export function inferEntryKind(memory: MemoryLike): MemoryEntryKind {
  return memory.entryKind ?? (memory.schedule?.dueAt ? "reminder" : "memory");
}

export function getMemorySchedule(memory: MemoryLike): MemorySchedule | undefined {
  if (memory.schedule?.dueAt) {
    return {
      dueAt: memory.schedule.dueAt,
      isRecurring: memory.schedule.isRecurring,
      recurrenceType: memory.schedule.recurrenceType,
    };
  }
  return undefined;
}

export function getReminderDate(memory: MemoryLike): string | undefined {
  return getMemorySchedule(memory)?.dueAt;
}

export function isReminder(memory: MemoryLike): boolean {
  return inferEntryKind(memory) === "reminder" && !!getReminderDate(memory);
}

export function deriveNextDueAt(input: { entryKind?: MemoryEntryKind; schedule?: MemorySchedule }) {
  const entryKind = input.schedule?.dueAt ? "reminder" : (input.entryKind ?? "memory");
  return entryKind === "reminder" ? input.schedule?.dueAt : undefined;
}

export function deriveEmbeddingState(embedding?: number[] | null): MemoryEmbeddingState {
  return Array.isArray(embedding) && embedding.length > 0 ? "ready" : "missing";
}

export function toStoredMemoryFields(input: {
  entryKind?: MemoryEntryKind;
  schedule?: MemorySchedule;
}) {
  const hasDueAt = !!input.schedule?.dueAt;
  // A "reminder" without a due date is invalid; treat it as "memory" to avoid broken state
  const entryKind: MemoryEntryKind = hasDueAt
    ? "reminder"
    : input.entryKind === "reminder"
      ? "memory"
      : (input.entryKind ?? "memory");
  const schedule =
    entryKind === "reminder" && input.schedule?.dueAt
      ? {
          dueAt: input.schedule.dueAt,
          isRecurring: input.schedule.isRecurring,
          recurrenceType: input.schedule.recurrenceType,
        }
      : undefined;

  return {
    entryKind,
    schedule,
    nextDueAt: deriveNextDueAt({ entryKind, schedule }),
  };
}

export function toMemorySummaryFields(memory: Doc<"memories">) {
  const schedule = getMemorySchedule(memory);
  return {
    entry_kind: inferEntryKind(memory),
    schedule: schedule
      ? {
          due_at: schedule.dueAt,
          is_recurring: schedule.isRecurring,
          recurrence_type: schedule.recurrenceType ?? null,
        }
      : null,
  };
}
