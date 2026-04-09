import type {
  MemoryEntryKind,
  MemoryRecurrenceType,
  MemorySchedule,
} from "./memory";

type MemoryLike = {
  entryKind?: MemoryEntryKind;
  schedule?: MemorySchedule;
};

export function inferMemoryEntryKind(memory: MemoryLike): MemoryEntryKind {
  return memory.entryKind ?? (memory.schedule?.dueAt ? "reminder" : "memory");
}

export function getMemorySchedule(memory: MemoryLike): MemorySchedule | undefined {
  return memory.schedule?.dueAt ? memory.schedule : undefined;
}

export function getReminderDate(memory: MemoryLike): string | undefined {
  return getMemorySchedule(memory)?.dueAt;
}

export function isReminder(memory: MemoryLike): boolean {
  return inferMemoryEntryKind(memory) === "reminder" && !!getReminderDate(memory);
}
