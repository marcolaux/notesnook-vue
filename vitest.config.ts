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
      "@notesnook-vue/contracts/*": resolve(__dirname, "packages/contracts/src/*")
    }
  }
});