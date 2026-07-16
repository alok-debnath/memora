/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { convexTest } from "convex-test";

import { listDueReminders } from "../convex/model/memories/reminders";
import schema from "../convex/schema";

describe("reminder queries", () => {
  test("due reminders exclude undated memories and malformed reminder rows", async () => {
    const t = convexTest({
      schema,
      modules: {
        "../convex/_generated/server.ts": () => import("../convex/_generated/server"),
      },
    });
    const now = "2026-07-16T12:00:00.000Z";

    const { userId, dueReminderId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        email: "reminders@test.dev",
        name: "Reminder Tester",
      });

      await ctx.db.insert("memories", {
        userId,
        title: "Ordinary memory",
        importance: "normal",
        entryKind: "memory",
        status: "active",
        embeddingState: "missing",
      });
      await ctx.db.insert("memories", {
        userId,
        title: "Malformed reminder",
        importance: "normal",
        entryKind: "reminder",
        nextDueAt: "2026-07-15T12:00:00.000Z",
        status: "active",
        embeddingState: "missing",
      });
      const dueReminderId = await ctx.db.insert("memories", {
        userId,
        title: "Valid reminder",
        importance: "normal",
        entryKind: "reminder",
        schedule: {
          dueAt: "2026-07-15T12:00:00.000Z",
          isRecurring: false,
        },
        nextDueAt: "2026-07-15T12:00:00.000Z",
        status: "active",
        embeddingState: "missing",
      });

      return { userId, dueReminderId };
    });

    const results = await t.run((ctx) => listDueReminders(ctx, { userId, asOf: now, limit: 20 }));

    expect(results.map((memory) => memory._id)).toEqual([dueReminderId]);
  });
});
