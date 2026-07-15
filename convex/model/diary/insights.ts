import type { Doc } from "../../_generated/dataModel";

/**
 * Pure rollup helpers for diary calendar/insights queries. Inputs are already
 * bounded index-range reads; everything here is O(entries) in-memory math.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Local-day key for a timestamp, shifted by the client's tz offset (minutes east of UTC negative, per JS getTimezoneOffset). */
export function localDayKey(timestampMs: number, tzOffsetMinutes: number): string {
  return new Date(timestampMs - tzOffsetMinutes * 60 * 1000).toISOString().slice(0, 10);
}

export type DiaryCalendarDay = {
  dayKey: string;
  count: number;
  dominantMood: string | null;
};

export function buildCalendarSummary(
  entries: Doc<"diaryEntries">[],
  tzOffsetMinutes: number,
): DiaryCalendarDay[] {
  const byDay = new Map<string, { count: number; moods: Map<string, number> }>();
  for (const entry of entries) {
    const dayKey = localDayKey(entry._creationTime, tzOffsetMinutes);
    const day = byDay.get(dayKey) ?? { count: 0, moods: new Map<string, number>() };
    day.count += 1;
    if (entry.mood) {
      day.moods.set(entry.mood, (day.moods.get(entry.mood) ?? 0) + 1);
    }
    byDay.set(dayKey, day);
  }

  return Array.from(byDay.entries())
    .map(([dayKey, day]) => ({
      dayKey,
      count: day.count,
      dominantMood: pickDominant(day.moods),
    }))
    .sort((a, b) => a.dayKey.localeCompare(b.dayKey));
}

export type DiaryInsights = {
  totalInRange: number;
  truncated: boolean;
  moodDistribution: Array<{ mood: string; count: number }>;
  energyDistribution: Array<{ level: string; count: number }>;
  /** Oldest → newest, one point per local day with entries; mood mapped for sparkline use. */
  moodTimeline: Array<{ dayKey: string; mood: string | null }>;
  topTopics: Array<{ topic: string; count: number }>;
  habitSentiment: Array<{ habit: string; positive: number; negative: number; neutral: number }>;
  recentActionItems: string[];
  activeDays: number;
  currentStreakDays: number;
};

export function buildInsights(
  entries: Doc<"diaryEntries">[],
  tzOffsetMinutes: number,
  truncated: boolean,
): DiaryInsights {
  const moodCounts = new Map<string, number>();
  const energyCounts = new Map<string, number>();
  const topicCounts = new Map<string, number>();
  const habits = new Map<string, { positive: number; negative: number; neutral: number }>();
  const actionItems: string[] = [];
  const dayMoods = new Map<string, Map<string, number>>();

  for (const entry of entries) {
    if (entry.mood) moodCounts.set(entry.mood, (moodCounts.get(entry.mood) ?? 0) + 1);
    if (entry.energyLevel) {
      energyCounts.set(entry.energyLevel, (energyCounts.get(entry.energyLevel) ?? 0) + 1);
    }
    for (const topic of entry.topics ?? []) {
      topicCounts.set(topic, (topicCounts.get(topic) ?? 0) + 1);
    }
    for (const habit of entry.habitsDetected ?? []) {
      const row = habits.get(habit.habit) ?? { positive: 0, negative: 0, neutral: 0 };
      row[habit.sentiment] += 1;
      habits.set(habit.habit, row);
    }
    // entries arrive newest-first; keep the freshest items up front
    for (const item of entry.actionItems ?? []) {
      if (actionItems.length < 12 && !actionItems.includes(item)) actionItems.push(item);
    }
    const dayKey = localDayKey(entry._creationTime, tzOffsetMinutes);
    const moods = dayMoods.get(dayKey) ?? new Map<string, number>();
    if (entry.mood) moods.set(entry.mood, (moods.get(entry.mood) ?? 0) + 1);
    dayMoods.set(dayKey, moods);
  }

  const moodTimeline = Array.from(dayMoods.entries())
    .map(([dayKey, moods]) => ({ dayKey, mood: pickDominant(moods) }))
    .sort((a, b) => a.dayKey.localeCompare(b.dayKey));

  return {
    totalInRange: entries.length,
    truncated,
    moodDistribution: sortedCounts(moodCounts).map(([mood, count]) => ({ mood, count })),
    energyDistribution: sortedCounts(energyCounts).map(([level, count]) => ({ level, count })),
    moodTimeline,
    topTopics: sortedCounts(topicCounts)
      .slice(0, 8)
      .map(([topic, count]) => ({ topic, count })),
    habitSentiment: Array.from(habits.entries())
      .map(([habit, row]) => ({ habit, ...row }))
      .sort((a, b) => b.positive + b.negative + b.neutral - (a.positive + a.negative + a.neutral))
      .slice(0, 8),
    recentActionItems: actionItems,
    activeDays: dayMoods.size,
    currentStreakDays: computeStreak(Array.from(dayMoods.keys()), tzOffsetMinutes),
  };
}

function pickDominant(counts: Map<string, number>): string | null {
  let best: string | null = null;
  let bestCount = 0;
  for (const [key, count] of counts) {
    if (count > bestCount) {
      best = key;
      bestCount = count;
    }
  }
  return best;
}

function sortedCounts(counts: Map<string, number>): Array<[string, number]> {
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
}

/** Consecutive local days with entries, counting back from today (or yesterday if today is empty). */
function computeStreak(dayKeys: string[], tzOffsetMinutes: number): number {
  const days = new Set(dayKeys);
  const today = localDayKey(Date.now(), tzOffsetMinutes);
  let cursorMs = Date.parse(`${today}T00:00:00Z`);
  if (!days.has(today)) cursorMs -= DAY_MS;

  let streak = 0;
  while (days.has(new Date(cursorMs).toISOString().slice(0, 10))) {
    streak += 1;
    cursorMs -= DAY_MS;
  }
  return streak;
}
