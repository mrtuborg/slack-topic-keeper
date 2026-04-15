import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      obsidian: fileURLToPath(new URL("./src/__mocks__/obsidian.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    passWithNoTests: true,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/__mocks__/**",
        // main.ts and settings.ts depend on Obsidian's Plugin/PluginSettingTab
        // lifecycle and DOM APIs that are not available in the Node test environment.
        // The pure helper functions (isValidToken, isValidUserId, DEFAULT_SETTINGS)
        // are already covered via settings.test.ts.
        "src/main.ts",
        "src/settings.ts",
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
