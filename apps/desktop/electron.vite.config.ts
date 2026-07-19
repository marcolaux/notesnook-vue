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
      alias: {
        "@": resolve(__dirname, "src/renderer/src"),
        "@contracts": resolve(__dirname, "src/contracts"),
        "@platform": resolve(__dirname, "src/renderer/src/platform")
      }
    },
    plugins: [vue(), tailwindcss()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, "src/renderer/index.html") }
      }
    }
  }
});