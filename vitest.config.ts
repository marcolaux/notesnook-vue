import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    dir: "tests/contract",
    environment: "node",
    include: ["**/*.spec.ts"],
    coverage: { provider: "v8", reporter: ["text", "html"] }
  },
  resolve: {
    alias: {
      "@notesnook-vue/contracts": resolve(__dirname, "packages/contracts/src/index.ts"),
      "@notesnook-vue/contracts/*": resolve(__dirname, "packages/contracts/src/*"),
      // Allow contract tests to import the renderer platform modules, which use
      // the same path aliases as the electron-vite renderer build.
      "@contracts/*": resolve(__dirname, "apps/desktop/src/contracts/*"),
      "@notesnook-vue/shared": resolve(__dirname, "packages/shared/src/index.ts")
    }
  }
});