import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import "./style.css";
import { bootstrap } from "./platform/bootstrap";

const app = createApp(App);
app.use(createPinia());
app.mount("#app");

// Initialise platform capabilities (tRPC bridge now; Database later).
void bootstrap();