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

export default crons;
