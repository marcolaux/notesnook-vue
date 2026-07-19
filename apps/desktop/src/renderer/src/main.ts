import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import "./style.css";
// Command registration (app + editor actions populate the palette registry).
// Imported for its side effect; safe before Pinia (handlers resolve stores lazily).
import "./commands";

const app = createApp(App);
app.use(createPinia());
app.mount("#app");