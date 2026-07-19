/**
 * App-level commands (Phase 2.5). Registered on import (see `./index`). These
 * cover shell actions not bound to the editor — note lifecycle, tabs, auth,
 * reload, and sidebar navigation (Phase 3.5). Editor actions live in
 * `./editor-commands`.
 */
import { registerCommands } from "./registry";
import type { Command } from "./registry";
import { VIEWS } from "@/router/routes";

const appCommands: Command[] = [
  {
    id: "app:new-note",
    title: "New note",
    keywords: ["create", "add", "note"],
    group: "app",
    run: (ctx) => {
      void ctx.notes.create();
    }
  },
  {
    id: "app:close-tab",
    title: "Close tab",
    keywords: ["tab", "close", "editor"],
    group: "app",
    when: (ctx) => !!ctx.notes.activeTabId,
    run: (ctx) => {
      const id = ctx.notes.activeTabId;
      if (id) ctx.notes.closeTab(id);
    }
  },
  {
    id: "app:sign-out",
    title: "Log out",
    keywords: ["logout", "sign out", "account"],
    group: "app",
    when: (ctx) => ctx.auth.isLoggedIn,
    run: (ctx) => {
      void ctx.auth.logout();
    }
  },
  {
    id: "app:sign-in",
    title: "Sign in",
    keywords: ["login", "log in", "account"],
    group: "app",
    when: (ctx) => !ctx.auth.isLoggedIn,
    run: (ctx) => {
      ctx.auth.requestSignIn();
    }
  },
  {
    id: "app:reload",
    title: "Reload window",
    keywords: ["refresh", "restart"],
    group: "app",
    run: () => {
      location.reload();
    }
  },
  {
    id: "app:search-notes",
    title: "Search notes",
    keywords: ["find", "filter", "list"],
    group: "app",
    when: (ctx) => ctx.auth.showShell,
    run: (ctx) => {
      ctx.notes.focusSearch();
    }
  }
];

/**
 * "Go to <view>" navigation commands (Phase 3.5) — one per sidebar entry in
 * `VIEWS`. Visible only when the shell is showing and a router is available.
 */
const gotoCommands: Command[] = VIEWS.map((v) => ({
  id: `app:goto-${v.name}`,
  title: `Go to ${v.label}`,
  keywords: ["go", "goto", "navigate", "open", "view", v.label.toLowerCase()],
  group: "app",
  when: (ctx) => ctx.auth.showShell && !!ctx.router,
  run: (ctx) => {
    ctx.router?.push(v.path);
  }
}));

registerCommands([...appCommands, ...gotoCommands]);