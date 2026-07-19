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
  },
  // Pane/panel toggle commands (Phase 5.3) — the toolbar + "rest over command
  // palette" entry points for collapsing the sidebar / list and showing the
  // right-side ToC + properties panels. The panel UI itself is on-site.
  {
    id: "app:toggle-sidebar",
    title: "Toggle sidebar",
    keywords: ["sidebar", "collapse", "navigation"],
    group: "app",
    when: (ctx) => ctx.auth.showShell,
    run: (ctx) => ctx.shell.toggleSidebar()
  },
  {
    id: "app:toggle-list",
    title: "Toggle notes list",
    keywords: ["list", "collapse", "notes"],
    group: "app",
    when: (ctx) => ctx.auth.showShell,
    run: (ctx) => ctx.shell.toggleList()
  },
  {
    id: "app:toggle-toc",
    title: "Toggle table of contents",
    keywords: ["toc", "outline", "headings", "minimap"],
    group: "app",
    when: (ctx) => ctx.auth.showShell,
    run: (ctx) => ctx.shell.toggleToc()
  },
  {
    id: "app:toggle-properties",
    title: "Toggle properties panel",
    keywords: ["properties", "panel", "info", "metadata"],
    group: "app",
    when: (ctx) => ctx.auth.showShell,
    run: (ctx) => ctx.shell.toggleProperties()
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