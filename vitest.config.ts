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
    // Array form (with RegExp `find`) is required so the wildcard aliases
    // (`@/*`, `@notesnook-vue/*/deep-path`) actually resolve — Vite's object
    // alias form only does exact-string matches, so `*` keys are silently dead.
    // Bare-specifier entries come first so they win over their wildcard siblings.
    alias: [
      { find: "@notesnook-vue/contracts", replacement: resolve(__dirname, "packages/contracts/src/index.ts") },
      { find: /^@notesnook-vue\/contracts\/(.+)$/, replacement: resolve(__dirname, "packages/contracts/src") + "/$1" },
      { find: "@notesnook-vue/shared", replacement: resolve(__dirname, "packages/shared/src/index.ts") },
      { find: "@notesnook-vue/editor-vue", replacement: resolve(__dirname, "packages/editor-vue/src/index.ts") },
      { find: /^@notesnook-vue\/editor-vue\/(.+)$/, replacement: resolve(__dirname, "packages/editor-vue/src") + "/$1" },
      { find: "@notesnook-vue/theme-vue", replacement: resolve(__dirname, "packages/theme-vue/src/index.ts") },
      { find: /^@notesnook-vue\/theme-vue\/(.+)$/, replacement: resolve(__dirname, "packages/theme-vue/src") + "/$1" },
      { find: "@notesnook-vue/ui-vue", replacement: resolve(__dirname, "packages/ui-vue/src/index.ts") },
      { find: /^@notesnook-vue\/ui-vue\/(.+)$/, replacement: resolve(__dirname, "packages/ui-vue/src") + "/$1" },
      // Renderer path aliases (same as the electron-vite renderer build) so
      // contract tests can import renderer platform modules / stores.
      { find: /^@contracts\/(.+)$/, replacement: resolve(__dirname, "apps/desktop/src/contracts") + "/$1" },
      { find: /^@\/(.+)$/, replacement: resolve(__dirname, "apps/desktop/src/renderer/src") + "/$1" }
    ]
  }
});