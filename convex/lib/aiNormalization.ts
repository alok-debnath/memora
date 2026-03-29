const MEMORY_CATEGORIES = new Set([
  "personal",
  "work",
  "finance",
  "health",
  "other",
] as const);

const MEMORY_MOODS = new Set([
  "happy",
  "sad",
  "anxious",
  "excited",
  "neutral",
  "grateful",
  "frustrated",
  "hopeful",
  "nostalgic",
  "motivated",
] as const);

const MEMORY_IMPORTANCE = new Set([
  "critical",
  "high",
  "normal",
  "low",
] as const);

const MEMORY_LIFE_AREAS = new Set([
  "career",
  "family",
  "health",
  "finance",
  "social",
  "hobbies",
  "education",
  "travel",
  "self-care",
  "relationships",
] as const);

const DIARY_ENERGY = new Set(["high", "medium", "low"] as const);

type MemoryCategory = "personal" | "work" | "finance" | "health" | "other";
type MemoryMood =
  | "happy"
  | "sad"
  | "anxious"
  | "excited"
  | "neutral"
  | "grateful"
  | "frustrated"
  | "hopeful"
  | "nostalgic"
  | "motivated";
type MemoryImportance = "critical" | "high" | "normal" | "low";
type MemoryLifeArea =
  | "career"
  | "family"
  | "health"
  | "finance"
  | "social"
  | "hobbies"
  | "education"
  | "travel"
  | "self-care"
  | "relationships";
type DiaryEnergy = "high" | "medium" | "low";

function asTrimmedString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const result = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);

  return result.length > 0 ? result : [];
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asEnumValue<T extends string>(value: unknown, valid: Set<T>) {
  return typeof value === "string" && valid.has(value as T)
    ? (value as T)
    : undefined;
}

function asBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

function asActionType(value: unknown) {
  return typeof value === "string" &&
    ["task", "reminder", "fact", "decision"].includes(value)
    ? (value as "task" | "reminder" | "fact" | "decision")
    : undefined;
}

function asStringRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const result = Object.fromEntries(
    Object.entries(value).flatMap(([key, item]) => {
      const normalized = asTrimmedString(item);
      return normalized ? [[key, normalized]] : [];
    })
  );

  return Object.keys(result).length > 0 ? result : undefined;
}

export function normalizeExtractedActions(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const action =
      asTrimmedString((item as { action?: unknown }).action) ||
      asTrimmedString((item as { text?: unknown }).text);
    const completed = asBoolean((item as { completed?: unknown }).completed);
    const actionType = asActionType((item as { type?: unknown }).type);
    if (!action) {
      return [];
    }

    return [{ action, completed: completed ?? false, actionType }];
  });
}

export function normalizeMemoryFields(value: Record<string, unknown>) {
  const contextTags = value.contextTags ?? value.context_tags;
  const normalizedContext =
    contextTags && typeof contextTags === "object" && !Array.isArray(contextTags)
      ? {
          who: asStringArray((contextTags as Record<string, unknown>).who),
          what: asTrimmedString((contextTags as Record<string, unknown>).what),
          where: asTrimmedString(
            (contextTags as Record<string, unknown>).where
          ),
          why: asTrimmedString((contextTags as Record<string, unknown>).why),
        }
      : undefined;

  return {
    title: asTrimmedString(value.title),
    content: asTrimmedString(value.content),
    category: asEnumValue<MemoryCategory>(value.category, MEMORY_CATEGORIES),
    mood: asEnumValue<MemoryMood>(value.mood, MEMORY_MOODS),
    tags: asStringArray(value.tags),
    people: asStringArray(value.people),
    locations: asStringArray(value.locations),
    importance: asEnumValue<MemoryImportance>(value.importance, MEMORY_IMPORTANCE),
    lifeArea: asEnumValue<MemoryLifeArea>(
      value.lifeArea ?? value.life_area,
      MEMORY_LIFE_AREAS
    ),
    contextTags:
      normalizedContext &&
      (normalizedContext.who?.length ||
        normalizedContext.what ||
        normalizedContext.where ||
        normalizedContext.why)
        ? normalizedContext
        : undefined,
    linkedUrls: asStringArray(value.linkedUrls ?? value.linked_urls),
    reminderDate: asTrimmedString(value.reminderDate ?? value.reminder_date),
    sentimentScore: asNumber(value.sentimentScore ?? value.sentiment_score),
    extractedActions: normalizeExtractedActions(
      value.extractedActions ?? value.extracted_actions
    ),
  };
}

export function normalizeDiaryFields(value: Record<string, unknown>) {
  const topics = asStringArray(value.topics);
  return {
    correctedText: asTrimmedString(value.correctedText),
    summary: asTrimmedString(value.summary),
    mood: asEnumValue<MemoryMood>(value.mood, MEMORY_MOODS),
    energyLevel: asEnumValue<DiaryEnergy>(value.energyLevel, DIARY_ENERGY),
    topics,
    insights: Array.isArray(value.insights)
      ? value.insights.flatMap((item) => {
          if (!item || typeof item !== "object") {
            return [];
          }

          const insight = asTrimmedString((item as { insight?: unknown }).insight);
          const category = asTrimmedString((item as { category?: unknown }).category);
          if (!insight || !category) {
            return [];
          }

          return [{ insight, category }];
        })
      : [],
    habitsDetected: Array.isArray(value.habitsDetected ?? value.habits_detected)
      ? ((value.habitsDetected ?? value.habits_detected) as unknown[]).flatMap((item) => {
          if (!item || typeof item !== "object") {
            return [];
          }

          const habit = asTrimmedString((item as { habit?: unknown }).habit);
          const sentiment = asTrimmedString(
            (item as { sentiment?: unknown }).sentiment
          );
          const frequencyHint =
            asTrimmedString(
              (item as { frequencyHint?: unknown }).frequencyHint
            ) ||
            asTrimmedString(
              (item as { frequency_hint?: unknown }).frequency_hint
            );
          if (
            !habit ||
            !sentiment ||
            !["positive", "negative", "neutral"].includes(sentiment)
          ) {
            return [];
          }

          return [
            {
              habit,
              sentiment: sentiment as "positive" | "negative" | "neutral",
              ...(frequencyHint ? { frequencyHint } : {}),
            },
          ];
        })
      : [],
    personalityTraits: Array.isArray(
      value.personalityTraits ?? value.personality_traits
    )
      ? ((value.personalityTraits ?? value.personality_traits) as unknown[]).flatMap(
          (item) => {
            if (!item || typeof item !== "object") {
              return [];
            }
            const trait = asTrimmedString((item as { trait?: unknown }).trait);
            const evidence = asTrimmedString(
              (item as { evidence?: unknown }).evidence
            );
            if (!trait || !evidence) {
              return [];
            }
            return [{ trait, evidence }];
          }
        )
      : [],
    likes: asStringArray(value.likes) ?? [],
    dislikes: asStringArray(value.dislikes) ?? [],
    actionItems: asStringArray(value.actionItems ?? value.action_items) ?? [],
  };
}

export function normalizeDocumentMemory(value: Record<string, unknown>) {
  return {
    title: asTrimmedString(value.title),
    content: asTrimmedString(value.content),
    category: asEnumValue<MemoryCategory>(value.category, MEMORY_CATEGORIES) ?? "other",
    tags: asStringArray(value.tags) ?? [],
    importance:
      asEnumValue<MemoryImportance>(value.importance, MEMORY_IMPORTANCE) ?? "normal",
    people: asStringArray(value.people) ?? [],
    locations: asStringArray(value.locations) ?? [],
  };
}

export function normalizeKeyDetails(value: unknown) {
  return asStringRecord(value);
}
