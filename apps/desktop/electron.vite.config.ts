import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";

// Read the app version at build time so it can be injected into the renderer
// via `define` (the title-bar version label + the Updates settings section use
// it as `__APP_VERSION__`). In a release build the publish workflow rewrites
// this `version` field to the tag version before `npm run build`, so it matches
// the version electron-builder bakes into `app-update.yml`.
const pkg = JSON.parse(readFileSync(resolve(__dirname, "package.json"), "utf-8")) as { version: string };

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, "src/main/index.ts") }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, "src/preload/index.ts") }
      }
    }
  },
  renderer: {
    root: "src/renderer",
    resolve: {
      alias: [
        { find: "@", replacement: resolve(__dirname, "src/renderer/src") },
        { find: "@contracts", replacement: resolve(__dirname, "src/contracts") },
        { find: "@platform", replacement: resolve(__dirname, "src/renderer/src/platform") },
        // `libsodium-wrappers-sumo`'s ESM build references a sibling
        // `./libsodium-sumo.mjs` that lives in the separate `libsodium-sumo`
        // package (broken relative path). Its CJS/UMD build inlines the WASM
        // and is self-contained, so alias the bare import to it. Pulled in via
        // `@notesnook/crypto` → `@notesnook/sodium` (browser build).
        {
          find: /^libsodium-wrappers-sumo$/,
          replacement: resolve(__dirname, "../../node_modules/libsodium-wrappers-sumo/dist/modules-sumo/libsodium-wrappers.js")
        }
      ]
    },
    plugins: [vue(), tailwindcss()],
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version)
    },
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, "src/renderer/index.html") }
      }
    }
  }
});