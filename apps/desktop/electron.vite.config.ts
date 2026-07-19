import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";

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
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, "src/renderer/index.html") }
      }
    }
  }
});