import { defineConfig } from "vitest/config";
import { resolve } from "node:path";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  // Needed so contract tests that import `@notesnook-vue/editor-vue` can load
  // its `.vue` node-view components (the editor-html round-trip test).
  plugins: [vue()],
  test: {
    dir: "tests/contract",
    environment: "node",
    include: ["**/*.spec.ts"],
    coverage: { provider: "v8", reporter: ["text", "html"] },
    // @notesnook/sodium's node build requires the native `sodium-native` CJS
    // module; vitest's ESM loader can't resolve its named exports. Inlining
    // these deps routes them through esbuild's CJS interop. (The renderer
    // build uses sodium's browser/WASM build, which doesn't have this issue.)
    server: {
      deps: {
        inline: [/@notesnook\//, "sodium-native", "better-sqlite3-multiple-ciphers"]
      }
    }
  },
  resolve: {
    alias: {
      "@notesnook-vue/contracts": resolve(__dirname, "packages/contracts/src/index.ts"),
      "@notesnook-vue/contracts/*": resolve(__dirname, "packages/contracts/src/*"),
      // Allow contract tests to import the renderer platform modules, which use
      // the same path aliases as the electron-vite renderer build.
      "@contracts/*": resolve(__dirname, "apps/desktop/src/contracts/*"),
      "@notesnook-vue/shared": resolve(__dirname, "packages/shared/src/index.ts"),
      "@notesnook-vue/editor-vue": resolve(__dirname, "packages/editor-vue/src/index.ts"),
      "@notesnook-vue/editor-vue/*": resolve(__dirname, "packages/editor-vue/src/*"),
      "@notesnook-vue/theme-vue": resolve(__dirname, "packages/theme-vue/src/index.ts"),
      "@notesnook-vue/theme-vue/*": resolve(__dirname, "packages/theme-vue/src/*"),
      "@notesnook-vue/ui-vue": resolve(__dirname, "packages/ui-vue/src/index.ts"),
      "@notesnook-vue/ui-vue/*": resolve(__dirname, "packages/ui-vue/src/*")
    }
  }
});