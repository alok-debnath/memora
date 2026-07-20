import { defineConfig } from "vitest/config";

/**
 * Convex-test suite only — separate from the app's `bun test` suite under
 * tests/ (which uses bun:test and Bun's runtime). convex-test needs the
 * edge-runtime environment to match Convex's isolate execution model, which
 * Bun's native test runner doesn't provide. Run with `bun run test:convex`.
 */
export default defineConfig({
  test: {
    environment: "edge-runtime",
    server: { deps: { inline: ["convex-test"] } },
    include: ["convex/**/*.test.ts"],
  },
});
