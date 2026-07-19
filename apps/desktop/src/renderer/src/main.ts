import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import { router } from "./router";
import { setCommandRouter } from "./commands/registry";
import "./style.css";
// Command registration (app + editor actions populate the palette registry).
// Imported for its side effect; safe before Pinia (handlers resolve stores lazily).
import "./commands";

const app = createApp(App);
// Pinia before the router: the navigation guard reads `useAuthStore()` on the
// initial (auto-started) navigation, which needs an active Pinia.
app.use(createPinia());
app.use(router);
// Expose the router to command-palette handlers (goto-* commands).
setCommandRouter(router);
app.mount("#app");