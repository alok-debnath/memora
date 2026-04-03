export interface ConvexMemory {
  _id: string;
  _creationTime: number;
  userId: string;
  title: string;
  content: string;
  entryKind?: "memory" | "reminder";
  schedule?: {
    dueAt: string;
    isRecurring: boolean;
    recurrenceType?: "daily" | "weekly" | "monthly" | "yearly";
  };
  category: "personal" | "work" | "finance" | "health" | "other";
  mood?: string;
  tags: string[];
  people: string[];
  locations: string[];
  importance: "critical" | "high" | "normal" | "low";
  lifeArea?: string;
  sentimentScore?: number;
  linkedUrls: string[];
  extractedActions?: Array<{ action: string; completed: boolean }>;
  capsuleUnlockDate?: string;
  embedding?: number[];
  shareToken?: string;
  isPublic?: boolean;
  isDeleted: boolean;
  deletedAt?: number;
}

export interface ConvexDiaryEntry {
  _id: string;
  _creationTime: number;
  userId: string;
  rawText: string;
  correctedText?: string;
  mood?: string;
  energyLevel?: "high" | "medium" | "low";
  topics: string[];
  structuredInsights?: Array<{ insight: string; category: string }>;
}

export interface ConvexNudge {
  _id: string;
  _creationTime: number;
  userId: string;
  title: string;
  message: string;
  nudgeType: string;
  priority: "high" | "normal" | "low";
  isDismissed: boolean;
  isActedOn: boolean;
}

export interface ConvexChatMessage {
  _id: string;
  _creationTime: number;
  userId: string;
  role: "user" | "assistant";
  content: string;
}
