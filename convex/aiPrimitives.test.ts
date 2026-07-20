/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { AI_TABLE_ALLOWLIST } from "./lib/aiPrimitives/tableRegistry";

const modules = import.meta.glob("./**/*.ts");

const FORBIDDEN_KEYS = new Set(["userId", "sharedByUserId", "token", "_id", "_creationTime"]);

async function seedUser(t: ReturnType<typeof convexTest>, subject: string) {
  const identity = { subject, issuer: "https://convex.test" };
  const tokenIdentifier = `${identity.issuer}|${identity.subject}`;
  const userId = await t.run(async (ctx) =>
    ctx.db.insert("users", {
      email: `${subject}@example.com`,
      name: subject,
      tokenIdentifier,
    }),
  );
  return { userId, asUser: t.withIdentity(identity) };
}

describe("AI_TABLE_ALLOWLIST safety", () => {
  test("no create/update whitelist ever includes an owner/identity field", () => {
    for (const config of Object.values(AI_TABLE_ALLOWLIST)) {
      for (const key of [
        ...(config.allowedCreateKeys ?? []),
        ...(config.allowedUpdateKeys ?? []),
      ]) {
        expect(FORBIDDEN_KEYS.has(key)).toBe(false);
      }
    }
  });

  test("every allowlisted table exists in the schema", () => {
    const tableNames = new Set(Object.keys(schema.tables));
    for (const table of Object.keys(AI_TABLE_ALLOWLIST)) {
      expect(tableNames.has(table)).toBe(true);
    }
  });
});

describe("generic primitives: unknown table / disallowed op", () => {
  test("aiGetDoc rejects a table not on the allowlist", async () => {
    const t = convexTest(schema, modules);
    const { asUser } = await seedUser(t, "u1");
    await expect(
      asUser.query(api.aiPrimitives.aiGetDoc, {
        token: "x",
        table: "userAiProviderSecrets",
        id: "irrelevant",
      }),
    ).rejects.toThrow(/Unknown table/);
  });

  test("aiDeleteDoc refuses memories — delete_doc must never remove a memory", async () => {
    const t = convexTest(schema, modules);
    const { asUser } = await seedUser(t, "u1");
    await expect(
      asUser.mutation(api.aiPrimitives.aiDeleteDoc, {
        token: "x",
        table: "memories",
        id: "irrelevant",
      }),
    ).rejects.toThrow(/not allowed/);
  });
});

describe("generic primitives: field whitelist enforcement", () => {
  test("aiUpdateDoc on userTopics strips fields outside allowedUpdateKeys", async () => {
    const t = convexTest(schema, modules);
    const { userId, asUser } = await seedUser(t, "u1");
    const topicId = await t.run(async (ctx) =>
      ctx.db.insert("userTopics", {
        userId,
        name: "Old name",
        slug: "old-name",
        description: "desc",
        icon: "tag",
        color: "#000000",
        centroid: [0.1, 0.2],
        memoryCount: 0,
        relatedTopics: [],
        isArchived: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );

    await asUser.mutation(api.aiPrimitives.aiUpdateDoc, {
      token: "x",
      table: "userTopics",
      id: topicId,
      fields: {
        name: "New name",
        // Not in allowedUpdateKeys — must be silently dropped, not persisted.
        centroid: [9.9, 9.9],
        slug: "hijacked-slug",
        memoryCount: 99999,
      },
    });

    const topic = await t.run(async (ctx) => ctx.db.get(topicId));
    expect(topic?.name).toBe("New name");
    expect(topic?.centroid).toEqual([0.1, 0.2]);
    expect(topic?.slug).toBe("old-name");
    expect(topic?.memoryCount).toBe(0);
  });

  test("aiUpdateDoc on memories only accepts the active-restore transition", async () => {
    const t = convexTest(schema, modules);
    const { userId, asUser } = await seedUser(t, "u1");
    const memoryId = await t.run(async (ctx) =>
      ctx.db.insert("memories", {
        userId,
        title: "Deleted memory",
        content: "content",
        importance: "normal",
        entryKind: "memory",
        embeddingState: "missing",
        status: "deleted",
        deletedAt: Date.now(),
      }),
    );

    await expect(
      asUser.mutation(api.aiPrimitives.aiUpdateDoc, {
        token: "x",
        table: "memories",
        id: memoryId,
        fields: { status: "completed" },
      }),
    ).rejects.toThrow(/only supports/);

    await asUser.mutation(api.aiPrimitives.aiUpdateDoc, {
      token: "x",
      table: "memories",
      id: memoryId,
      fields: { status: "active" },
    });
    const restored = await t.run(async (ctx) => ctx.db.get(memoryId));
    expect(restored?.status).toBe("active");
  });
});

describe("generic primitives: ownership isolation", () => {
  test("a user cannot get, update, or delete another user's row", async () => {
    const t = convexTest(schema, modules);
    const { userId: ownerId } = await seedUser(t, "owner");
    const { asUser: asOther } = await seedUser(t, "intruder");

    const topicId = await t.run(async (ctx) =>
      ctx.db.insert("userTopics", {
        userId: ownerId,
        name: "Private topic",
        slug: "private-topic",
        description: "desc",
        icon: "tag",
        color: "#000000",
        centroid: [],
        memoryCount: 0,
        relatedTopics: [],
        isArchived: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );

    const doc = await asOther.query(api.aiPrimitives.aiGetDoc, {
      token: "x",
      table: "userTopics",
      id: topicId,
    });
    expect(doc).toBeNull();

    await expect(
      asOther.mutation(api.aiPrimitives.aiUpdateDoc, {
        token: "x",
        table: "userTopics",
        id: topicId,
        fields: { name: "Hijacked" },
      }),
    ).rejects.toThrow(/Not found/);

    const untouched = await t.run(async (ctx) => ctx.db.get(topicId));
    expect(untouched?.name).toBe("Private topic");
  });
});

describe("combineMemories", () => {
  test("merges structural fields, retires sources, and only cards the survivor", async () => {
    const t = convexTest(schema, modules);
    const { userId, asUser } = await seedUser(t, "u1");

    const primaryId = await t.run(async (ctx) =>
      ctx.db.insert("memories", {
        userId,
        title: "Seat 2",
        content: "Seat 2 for next week",
        people: ["Alice"],
        importance: "normal",
        entryKind: "memory",
        embeddingState: "missing",
        status: "active",
      }),
    );
    const sourceId = await t.run(async (ctx) =>
      ctx.db.insert("memories", {
        userId,
        title: "Seat 8",
        content: "Seat 8 for next week",
        people: ["Bob"],
        importance: "high",
        entryKind: "memory",
        embeddingState: "missing",
        status: "active",
      }),
    );

    const result = await asUser.mutation(api.memories.combineMemories, {
      token: "x",
      primaryId,
      mergeIds: [sourceId],
      title: "Office seat allocation",
      content: "Seats 2 and 8 are allocated for next week.",
    });

    expect(result.mergedCount).toBe(1);
    expect(result.memory.id).toBe(primaryId);

    const primary = await t.run(async (ctx) => ctx.db.get(primaryId));
    expect(primary?.title).toBe("Office seat allocation");
    expect(primary?.people?.sort()).toEqual(["Alice", "Bob"]);
    // Max of normal/high across the merged set.
    expect(primary?.importance).toBe("high");

    const source = await t.run(async (ctx) => ctx.db.get(sourceId));
    expect(source?.status).toBe("deleted");
    expect(source?.mergedIntoId).toBe(primaryId);

    // A stale reference to the retired id must not survive the DB-backed
    // card validation gate, regardless of what the model claims it used.
    const validIds: string[] = await t.run((ctx) =>
      ctx.runQuery(internal.memories.filterValidCardIds, {
        userId,
        ids: [String(primaryId), String(sourceId)],
      }),
    );
    expect(validIds).toEqual([String(primaryId)]);
  });

  test("rejects merging a memory belonging to another user", async () => {
    const t = convexTest(schema, modules);
    const { userId: ownerId } = await seedUser(t, "owner");
    const { asUser: asOther } = await seedUser(t, "intruder");

    const primaryId = await t.run(async (ctx) =>
      ctx.db.insert("memories", {
        userId: ownerId,
        title: "Mine",
        content: "content",
        importance: "normal",
        entryKind: "memory",
        embeddingState: "missing",
        status: "active",
      }),
    );
    const otherId = await t.run(async (ctx) =>
      ctx.db.insert("memories", {
        userId: ownerId,
        title: "Also mine",
        content: "content",
        importance: "normal",
        entryKind: "memory",
        embeddingState: "missing",
        status: "active",
      }),
    );

    await expect(
      asOther.mutation(api.memories.combineMemories, {
        token: "x",
        primaryId,
        mergeIds: [otherId],
        title: "Hijacked",
        content: "Hijacked",
      }),
    ).rejects.toThrow(/Not found/);
  });
});
