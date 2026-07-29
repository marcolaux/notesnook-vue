import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import { router } from "./router";
import { setCommandRouter } from "./commands/registry";
import i18n from "./i18n";
import { installEditorLabelResolver } from "@/composables/use-editor-labels";
import { installInsertDateHandler } from "@/composables/use-insert-date";
import "./style.css";
// Command registration (app + editor actions populate the palette registry).
// Imported for its side effect; safe before Pinia (handlers resolve stores lazily).
import "./commands";
import { detectPlatform } from "@contracts/titlebar";
import { readTransparencyEnabled } from "@/stores/settings";
import {
  LOCAL_CONTEXT,
  readWindowContext,
  readCurrentContext
} from "@/platform/account-context";

// Mark the OS on <html> before first paint so CSS can opt out of the
// acrylic/glass look where the OS doesn't support window transparency (Linux:
// no vibrancy/acrylic, compositors ignore a transparent native bg). Mirrors the
// opaque native `backgroundColor` set for Linux in `main/titlebar.ts`.
//
// Also apply the user's transparency preference (`data-transparency`) now, so a
// user who disabled the glass look doesn't get a flash of acrylic before the
// store/App.vue wiring lands. The value is re-applied on the
// `transparencyChangeSignal` watch in `App.vue`.
if (typeof document !== "undefined") {
  document.documentElement.dataset.platform = detectPlatform(
    typeof window !== "undefined" ? window.os : undefined
  );
  document.documentElement.dataset.transparency = readTransparencyEnabled(
    readWindowContext() ?? readCurrentContext() ?? LOCAL_CONTEXT
  )
    ? "on"
    : "off";
}

const app = createApp(App);
// Pinia before the router: the navigation guard reads `useAuthStore()` on the
// initial (auto-started) navigation, which needs an active Pinia.
app.use(createPinia());
app.use(router);
// i18n (vue-i18n, Composition API mode) — installs `$t`/`useI18n` for the
// renderer. Locale is read from localStorage at construction (Phase 2.6/7.1).
app.use(i18n);
// Install the host tool-label resolver so editor-vue's slash menu (and the
// host toolbar via `editorToolTitle`) can resolve `tools.<id>` titles. Inert
// until `tools.*` keys are added to the catalog (Phase 7.1 batches).
installEditorLabelResolver();
// Install the host "insert date" picker opener so the editor-vue `insertDate`
// action (slash "Date" + palette "Insert date") opens the date picker popup.
installInsertDateHandler();
// Expose the router to command-palette handlers (goto-* commands).
setCommandRouter(router);
app.mount("#app");