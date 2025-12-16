import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    alias: {
      // Mock obsidian module since it's not available in test environment
      obsidian: new URL("./tests/mocks/obsidian.ts", import.meta.url).pathname,
    },
  },
});
