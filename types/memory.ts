import type { Mood, Importance, LifeArea } from "@/constants/categories";

export type MemoryEntryKind = "memory" | "reminder";
export type MemoryRecurrenceType = "yearly" | "monthly" | "weekly" | "daily";

export interface MemorySchedule {
  dueAt: string;
  isRecurring: boolean;
  recurrenceType?: MemoryRecurrenceType;
}

export interface MemoryNote {
  id: string;
  userId: string;
  title: string;
  content: string;
  primaryTopicId?: string;
  topicIds?: string[];
  people: string[];
  locations: string[];
  importance: Importance;
  lifeArea?: LifeArea;
  contextTags?: {
    who?: string[];
    what?: string;
    where?: string;
    why?: string;
  };
  sentimentScore?: number;
  linkedUrls: string[];
  extractedActions?: Array<{
    action: string;
    completed: boolean;
    actionType?: "task" | "reminder" | "fact" | "decision";
  }>;
  entryKind: MemoryEntryKind;
  schedule?: MemorySchedule;
  reminderDate?: string;
  isRecurring: boolean;
  recurrenceType?: MemoryRecurrenceType;
  capsuleUnlockDate?: string;
  isPublic?: boolean;
  attachments: MemoryAttachment[];
  createdAt: string;
  updatedAt: string;
}

export interface MemoryAttachment {
  id: string;
  memoryId: string;
  fileName: string;
  filePath: string;
  fileType: string;
  fileSize: number;
  createdAt: string;
}

export interface DiaryEntry {
  id: string;
  userId: string;
  rawText: string;
  correctedText?: string;
  mood?: Mood;
  energyLevel?: "high" | "medium" | "low";
  topics: string[];
  summary?: string;
  habitsDetected?: Array<{
    habit: string;
    sentiment: "positive" | "negative" | "neutral";
    frequencyHint?: string;
  }>;
  personalityTraits?: Array<{ trait: string; evidence: string }>;
  likes?: string[];
  dislikes?: string[];
  actionItems?: string[];
  structuredInsights?: Array<{ insight: string; category: string }>;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewCard {
  id: string;
  memoryId: string;
  memory: MemoryNote;
  nextReviewAt: string;
  intervalDays: number;
  easeFactor: number;
  repetitions: number;
  lastReviewedAt?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: Array<{ name: string; type: string; uri: string }>;
  createdAt: string;
}

export interface AINudge {
  id: string;
  title: string;
  message: string;
  nudgeType: string;
  priority: "high" | "normal" | "low";
  basedOn?: Record<string, unknown>;
  isDismissed: boolean;
  isActedOn: boolean;
  expiresAt?: string;
  createdAt: string;
}

export interface SharedMemory {
  id: string;
  memoryId: string;
  shareToken: string;
  expiresAt?: string;
  createdAt: string;
}

export interface DocumentExtraction {
  id: string;
  attachmentId: string;
  memoryId: string;
  extractedText: string;
  documentType: string;
  expiryDate?: string;
  keyDetails?: Record<string, string>;
  createdAt: string;
}

export interface UserProfile {
  id: string;
  fullName: string;
  email: string;
  timezone: string;
  createdAt: string;
}

export interface NotificationPreferences {
  emailEnabled: boolean;
  browserNotificationsEnabled: boolean;
  pushNotificationsEnabled: boolean;
}
