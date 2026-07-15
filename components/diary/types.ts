import type { Id } from "@/convex/_generated/dataModel";
import type { Mood } from "@/constants/categories";

/** Projection returned by api.diary.listPaginated / api.diary.search (see toDiaryListItem in convex/diary.ts). */
export type DiaryListItem = {
  _id: Id<"diaryEntries">;
  _creationTime: number;
  mood?: Mood;
  energyLevel?: "high" | "medium" | "low";
  topics: string[];
  summary?: string;
  excerpt: string;
  insight?: string;
  processing: boolean;
};
