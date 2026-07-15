import type { Doc, Id } from "../../_generated/dataModel";
import type { AttachmentExtractionResult } from "../attachmentExtraction";
import type { DiarySearchHit } from "../semanticSearch";
import type { MemoryCompact, MemorySummary } from "./projections";

export type MemoryDoc = Doc<"memories">;

export type ParsedAttachment = {
  name: string;
  fileType: string;
  url: string;
};

export type ChatAttachmentRecord = {
  attachmentId: Id<"memoryAttachments">;
  name: string;
  type: "image" | "document";
  mimeType: string;
  driveFileId: string;
  driveThumbnailLink?: string;
  driveWebViewLink?: string;
};

export type ChatAttachmentExtraction = ChatAttachmentRecord & AttachmentExtractionResult;

export type StreamingEvent = {
  label: string;
  value?: string;
};

export type StreamingStatus = {
  query?: string;
  phase?: string;
  toolName?: string;
  detail?: string;
  source?: string;
  cacheState?: string;
  resultCount?: number;
  previewItems?: string[];
  events?: StreamingEvent[];
  step?: number;
  totalSteps?: number;
};

export type MemorySearchResult = {
  results: MemorySummary[];
  diaryResults: DiarySearchHit[];
  count: number;
  isCached?: boolean;
  searchMode: "recent_only" | "semantic_fresh" | "semantic_cached";
  confidence: "strong" | "weak" | "empty";
  needsExpansion: boolean;
};

export type GroundingContext = {
  shouldGround: boolean;
  shouldPreferUpdate: boolean;
  isGenericOnly: boolean;
  searchCount: number;
  searchResults: MemorySummary[];
  diaryResults: DiarySearchHit[];
  recentMemories: MemoryCompact[];
  isCached: boolean;
  confidence: "strong" | "weak" | "empty";
  needsExpansion: boolean;
};

export type DeletionItem = {
  id: string;
  title: string;
  content: string;
  entry_kind: string;
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

/** Mirrors chatMessages.meta in schema.ts / chatMessageMetaValidator in chat.ts. */
export type ChatMessageMeta = {
  cards?: Array<{ table: "memories" | "diaryEntries"; id: string }>;
  cardSnapshots?: CardSnapshot[];
  deletionProposal?: DeletionItem[];
  isCached?: boolean;
  turns?: number;
  flow?: unknown;
  // `string` (not ChatErrorCode) because the Convex validator can't express
  // the literal union — producers still use ChatErrorCode.
  error?: { code: string; detail?: string };
};

/** Typed failure surface for a chat turn — keep in sync with schema/chat.ts/components. */
export type ChatErrorCode =
  "spend_cap" | "provider_auth" | "rate_limited" | "network" | "cancelled" | "unknown";

export type KnowledgeDigest = {
  totalMemories: number;
  totalReminders: number;
  totalDiaryEntries: number;
  diaryCountIsExact: boolean;
  profile: {
    likes: string[];
    dislikes: string[];
    traits: string[];
    habits: Array<{ habit: string; sentiment: "positive" | "negative" | "neutral" }>;
  } | null;
  recentDiary: Array<{
    id?: string;
    date: string;
    mood: string | null;
    summary: string;
  }>;
};
