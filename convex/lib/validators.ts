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
  v.literal("motivated")
);

export const importanceValidator = v.union(
  v.literal("critical"),
  v.literal("high"),
  v.literal("normal"),
  v.literal("low")
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
  v.literal("relationships")
);

export const recurrenceValidator = v.union(
  v.literal("yearly"),
  v.literal("monthly"),
  v.literal("weekly"),
  v.literal("daily")
);

export const extractedActionsValidator = v.array(
  v.object({
    action: v.string(),
    completed: v.boolean(),
    actionType: v.optional(
      v.union(
        v.literal("task"),
        v.literal("reminder"),
        v.literal("fact"),
        v.literal("decision")
      )
    ),
  })
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
  v.literal("low")
);

export const priorityValidator = v.union(
  v.literal("high"),
  v.literal("normal"),
  v.literal("low")
);

/**
 * Validator for encrypted envelope format
 * All encrypted fields use this structure
 */
export const encryptedEnvelopeValidator = v.object({
  v: v.number(), // encryption version
  n: v.string(), // base64 nonce
  c: v.string(), // base64 ciphertext
});

/**
 * Validator for user encryption key material
 */
export const keyMaterialValidator = v.object({
  version: v.number(),
  salt: v.string(),
  encryptedDek: v.string(),
  dekNonce: v.string(),
  iterations: v.number(),
});

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
  v.literal("encryption.rekey")
);
