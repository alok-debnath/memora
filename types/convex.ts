export interface ConvexMemory {
  _id: string;
  _creationTime: number;
  userId: string;
  title: string;
  content: string;
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
  reminderDate?: string;
  isRecurring: boolean;
  recurrenceType?: string;
  capsuleUnlockDate?: string;
  embedding?: number[];
  shareToken?: string;
  isPublic?: boolean;
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
