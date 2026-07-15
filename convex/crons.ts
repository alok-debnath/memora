import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Clean up memory history older than 7 days
crons.interval("cleanup old memory history", { hours: 24 }, internal.history.cleanupOld, {});

// Advance recurring reminders every hour (matches Supabase send-reminders cron)
crons.interval(
  "advance recurring reminders",
  { hours: 1 },
  internal.memories.advanceRecurringReminders,
  {},
);

// Backfill embeddings for memories that don't have them
crons.interval(
  "backfill embeddings",
  { hours: 6 },
  internal.actions.backfillEmbeddings.backfill,
  {},
);

// Same for diary entries — backfillDiary previously had no trigger besides
// its own self-scheduled continuation, so a diary entry whose write-time
// embed failed (transient outage, rate limit) stayed vector-unsearchable
// forever. Mirrors the memory backfill cadence.
crons.interval(
  "backfill diary embeddings",
  { hours: 6 },
  internal.actions.backfillEmbeddings.backfillDiary,
  {},
);

// Evict search query cache entries older than 30 days
crons.interval(
  "purge stale query cache",
  { hours: 24 },
  internal.memories.purgeStaleQueryCache,
  {},
);

// Keep raw AI usage logs bounded while preserving daily rollups indefinitely.
crons.interval(
  "cleanup ai usage events",
  { hours: 24 },
  internal.analytics.cleanupOldAiUsageEvents,
  {},
);

// Platform-wide counts for the admin dashboards (see adminDailyStats).
crons.interval("rollup admin daily stats", { hours: 6 }, internal.admin.rollupAdminDailyStats, {});

// Alert when documents stay embedding-less past the backfill retry window.
crons.interval(
  "check embedding health",
  { hours: 6 },
  internal.systemAlerts.checkEmbeddingHealth,
  {},
);

crons.interval(
  "cleanup abandoned transcription uploads",
  { hours: 1 },
  internal.transcriptionJobs.cleanupExpired,
  {},
);

export default crons;
