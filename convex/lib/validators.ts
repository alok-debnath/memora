import { v } from "convex/values";

export const moodValidator = v.union(
  v.literal("happy"),
  v.literal("sad"),
  v.literal("anxious"),
  v.literal("excited"),
  v.literal("neutral"),
  v.literal("grateful"),
  v.literal("frustrated"),
  v.literal("hopeful"),
  v.literal("nostalgic"),
  v.literal("motivated"),
);

export const importanceValidator = v.union(
  v.literal("critical"),
  v.literal("high"),
  v.literal("normal"),
  v.literal("low"),
);

export const lifeAreaValidator = v.union(
  v.literal("career"),
  v.literal("family"),
  v.literal("health"),
  v.literal("finance"),
  v.literal("social"),
  v.literal("hobbies"),
  v.literal("education"),
  v.literal("travel"),
  v.literal("self-care"),
  v.literal("relationships"),
);

export const recurrenceValidator = v.union(
  v.literal("yearly"),
  v.literal("monthly"),
  v.literal("weekly"),
  v.literal("daily"),
);

export const memoryEntryKindValidator = v.union(v.literal("memory"), v.literal("reminder"));

export const memoryScheduleValidator = v.object({
  dueAt: v.string(),
  isRecurring: v.boolean(),
  recurrenceType: v.optional(recurrenceValidator),
});

export const extractedActionsValidator = v.array(
  v.object({
    action: v.string(),
    completed: v.boolean(),
    actionType: v.optional(
      v.union(v.literal("task"), v.literal("reminder"), v.literal("fact"), v.literal("decision")),
    ),
  }),
);

export const contextTagsValidator = v.object({
  who: v.optional(v.array(v.string())),
  what: v.optional(v.string()),
  where: v.optional(v.string()),
  why: v.optional(v.string()),
});

export const energyLevelValidator = v.union(
  v.literal("high"),
  v.literal("medium"),
  v.literal("low"),
);

export const priorityValidator = v.union(v.literal("high"), v.literal("normal"), v.literal("low"));

export const aiProviderValidator = v.union(v.literal("openai"), v.literal("google"));

export const aiCapabilityValidator = v.union(
  v.literal("chat"),
  v.literal("structured_text"),
  v.literal("embeddings"),
  v.literal("vision"),
  v.literal("transcription"),
  v.literal("image_generation"),
);

export const aiCredentialSourceValidator = v.union(v.literal("platform"), v.literal("user_byok"));

export const aiBillingOwnerValidator = v.union(v.literal("platform"), v.literal("user"));

export const aiBilledToValidator = v.union(v.literal("memora"), v.literal("user_byok"));

export const aiPriceDisplayModeValidator = v.union(
  v.literal("estimated"),
  v.literal("exact"),
  v.literal("unavailable"),
);

export const aiPricingOperationValidator = v.union(
  v.literal("chat_completion"),
  v.literal("embedding"),
  v.literal("transcription"),
  v.literal("image_generation"),
);

export const embeddingRebuildStatusValidator = v.union(
  v.literal("idle"),
  v.literal("queued"),
  v.literal("reembedding_memories"),
  v.literal("rebuilding_topics"),
  v.literal("failed"),
);

/**
 * Audit log action types
 */
export const auditActionValidator = v.union(
  v.literal("memory.create"),
  v.literal("memory.read"),
  v.literal("memory.update"),
  v.literal("memory.delete"),
  v.literal("memory.share"),
  v.literal("diary.create"),
  v.literal("diary.read"),
  v.literal("diary.delete"),
  v.literal("chat.create"),
  v.literal("data.export"),
  v.literal("account.login"),
  v.literal("account.logout"),
  v.literal("account.delete"),
  v.literal("encryption.setup"),
  v.literal("encryption.rekey"),
);
