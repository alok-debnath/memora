import type { Id } from "@/convex/_generated/dataModel";

/** Reference to a document surfaced as a chat card. Extend the union to add card types. */
export type CardRef = {
  table: "memories" | "diaryEntries";
  id: string;
};

export type MemoryCardSnapshot = {
  table: "memories";
  id: string;
  title?: string;
  content?: string;
  entry_kind: string;
  schedule_due_at?: string | null;
  google_event_id?: string;
  google_sync_status?: "pending" | "synced" | "failed";
  google_sync_message?: string;
  google_sync_updated_at?: number;
};

export type DiaryCardSnapshot = {
  table: "diaryEntries";
  id: string;
  creation_time: number;
  mood: string | null;
  energy_level: string | null;
  topics: string[];
  summary: string | null;
  excerpt: string;
};

export type CardSnapshot = MemoryCardSnapshot | DiaryCardSnapshot;

/** Structured assistant-turn metadata persisted on chatMessages.meta. */
export type ChatMessageMeta = {
  cards?: CardRef[];
  cardSnapshots?: CardSnapshot[];
  deletionProposal?: Array<{
    id: string;
    title: string;
    content: string;
    entry_kind: string;
  }>;
  isCached?: boolean;
  turns?: number;
  flow?: unknown;
};

export type ChatMsg = {
  _id: string;
  role: "user" | "assistant";
  content?: string;
  _creationTime: number;
  meta?: ChatMessageMeta | null;
  streaming?: boolean;
  attachments?: Array<{
    attachmentId: Id<"memoryAttachments">;
    name: string;
    type: string;
    mimeType: string;
    driveWebViewLink?: string;
    driveThumbnailLink?: string;
  }>;
};

export type DeletionItem = {
  id: Id<"memories">;
  title: string;
  content: string;
  entry_kind: string;
};

export type SearchResultItem = {
  id: Id<"memories">;
  title?: string;
  content?: string;
  entry_kind: string;
  schedule_due_at?: string | null;
  google_event_id?: string;
  google_sync_status?: "pending" | "synced" | "failed";
  google_sync_message?: string;
  google_sync_updated_at?: number;
  _score?: number;
};

export type CardFlowAttachment = {
  name: string;
  type: "image" | "document";
  status: "completed" | "failed";
  method?: "gemini" | "openai" | "pdf-extract";
};

export type CardFlowSummary = {
  assistantProvider: "openai";
  turns: number;
  cardCount: number;
  pathMode: "cached" | "fresh";
  hasFiles: boolean;
};

export type CardFlowStep =
  | {
      kind: "grounding";
      query?: string;
      resultCount: number;
      cacheState?: "cached" | "fresh";
      searchMode?: "recent_only" | "semantic_fresh" | "semantic_cached";
    }
  | {
      kind: "search";
      query?: string;
      resultCount: number;
      cacheState?: "cached" | "fresh";
      searchMode?: "recent_only" | "semantic_fresh" | "semantic_cached";
    }
  | {
      kind: "files";
      total: number;
      completed: number;
      failed: number;
      methods?: Array<"gemini" | "openai" | "pdf-extract">;
    }
  | {
      kind: "tool";
      toolName: string;
      label?: string;
    }
  | {
      kind: "reasoning";
      turns: number;
      assistantProvider?: "openai";
    }
  | {
      kind: "result";
      cardCount: number;
    };

export type CardFlow = {
  chatTurnId?: string;
  assistantProvider?: "openai";
  toolSequence?: string[];
  searches?: unknown[];
  attachments?: CardFlowAttachment[];
  summary: CardFlowSummary;
  steps: CardFlowStep[];
};

export type ProgressStatus = {
  query?: string | null;
  phase?: string | null;
  toolName?: string | null;
  detail?: string | null;
  source?: string | null;
  cacheState?: string | null;
  resultCount?: number | null;
  previewItems?: string[] | null;
  events?: Array<{ label: string; value?: string | null }> | null;
  step?: number | null;
  totalSteps?: number | null;
  startedAt?: number | null;
  updatedAt?: number | null;
};

export type ThinkingDisplayItem = {
  _id: "__thinking__";
  role: "thinking";
  content: "";
  _creationTime: number;
};

export type ToolProgressDisplayItem = {
  _id: "__tool_progress__";
  role: "tool_progress";
  status: ProgressStatus;
  _creationTime: number;
};

export type AIChatDisplayItem = ChatMsg | ThinkingDisplayItem | ToolProgressDisplayItem;
