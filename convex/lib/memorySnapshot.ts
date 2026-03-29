import { Doc } from "../_generated/dataModel";

type MemorySnapshot = Omit<Doc<"memories">, "_id" | "_creationTime">;

export function serializeMemorySnapshot(memory: Doc<"memories">) {
  const { _id, _creationTime, embedding, ...snapshot } = memory;
  // Exclude embedding from snapshots to avoid bloating history records
  // (1536-dim float64 arrays are ~12KB each and not useful for undo/restore)
  return JSON.stringify(snapshot);
}

export function parseMemorySnapshot(snapshotJson?: string | null) {
  if (!snapshotJson) {
    return null;
  }

  try {
    return JSON.parse(snapshotJson) as MemorySnapshot;
  } catch {
    return null;
  }
}
