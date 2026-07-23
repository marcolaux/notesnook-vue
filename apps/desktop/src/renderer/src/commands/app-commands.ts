/**
 * App-level commands (Phase 2.5). Registered on import (see `./index`). These
 * cover shell actions not bound to the editor — note lifecycle, tabs, auth,
 * reload, and sidebar navigation (Phase 3.5). Editor actions live in
 * `./editor-commands`.
 */
import { registerCommands } from "./registry";
import type { Command } from "./registry";
import { VIEWS } from "@/router/routes";
import { desktop } from "@/platform/desktop-bridge";
import { usePublishDialogStore } from "@/stores/publish-dialog";
import { useDialogStore } from "@/stores/dialog";
import { useTemplatesStore } from "@/stores/templates";

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
    id: "app:new-task",
    title: "New task",
    keywords: ["create", "add", "task", "todo", "checklist"],
    group: "app",
    when: (ctx) => ctx.auth.showShell,
    run: (ctx) => {
      // Navigate to /tasks first (so the new note is created in that view) then
      // create. The default task template (config.defaultTaskTemplate)
      // auto-applies inside `create`; with no template it seeds a blank line +
      // an empty checklist so the note appears in Tasks immediately.
      ctx.router?.push("/tasks");
      void ctx.notes.create({ task: true });
    }
  },
  {
    id: "app:new-template",
    title: "New template",
    keywords: ["template", "create", "new"],
    group: "app",
    when: (ctx) => ctx.auth.showShell,
    run: () => {
      void useTemplatesStore().createTemplate();
    }
  },
  {
    id: "app:save-as-template",
    title: "Save as template",
    keywords: ["template", "save", "convert", "turn"],
    group: "app",
    when: (ctx) =>
      !!ctx.notes.activeNote &&
      !useTemplatesStore().isTemplate(ctx.notes.activeNote.id),
    run: (ctx) => {
      const id = ctx.notes.activeNote?.id;
      if (id) void useTemplatesStore().toggleTemplate(id);
    }
  },
  {
    id: "app:remove-template",
    title: "Remove template",
    keywords: ["template", "remove", "untag", "delete"],
    group: "app",
    when: (ctx) =>
      !!ctx.notes.activeNote &&
      useTemplatesStore().isTemplate(ctx.notes.activeNote.id),
    run: (ctx) => {
      const id = ctx.notes.activeNote?.id;
      if (id) void useTemplatesStore().toggleTemplate(id);
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
    id: "app:close-tab-and-trash",
    title: "Close tab and move to trash",
    keywords: ["tab", "close", "trash", "delete", "note"],
    group: "app",
    when: (ctx) => !!ctx.notes.activeNote,
    run: (ctx) => {
      // `moveToTrash(noteId)` trashes the note AND closes any open tab for it,
      // so this single call does both. Only meaningful for a note tab (the
      // `when` guard ensures `activeNote` exists; attachment/search tabs have
      // no associated note to trash).
      const id = ctx.notes.activeNote?.id;
      if (id) void ctx.notes.moveToTrash(id);
    }
  },
  // Split-pane + tab navigation commands (Phase 4.2/4.3). `split-*` add a new
  // pane to the right/bottom of the focused one; `close-pane` collapses it.
  // `focus-next-pane` cycles focus through the panes; `go-back`/`go-forward`
  // step the focused tab's back/forward history; `next-tab`/`prev-tab` cycle the
  // focused pane's tabs.
  {
    id: "app:split-vertical",
    title: "Split editor right",
    keywords: ["split", "pane", "vertical", "right", "side"],
    group: "app",
    when: (ctx) => ctx.auth.showShell,
    run: (ctx) => {
      ctx.layout.splitGroup("vertical");
    }
  },
  {
    id: "app:split-horizontal",
    title: "Split editor down",
    keywords: ["split", "pane", "horizontal", "down", "below"],
    group: "app",
    when: (ctx) => ctx.auth.showShell,
    run: (ctx) => {
      ctx.layout.splitGroup("horizontal");
    }
  },
  {
    id: "app:close-pane",
    title: "Close editor pane",
    keywords: ["split", "pane", "close", "collapse"],
    group: "app",
    when: (ctx) => ctx.auth.showShell && ctx.layout.groupCount > 1,
    run: (ctx) => {
      ctx.layout.closeGroup(ctx.layout.activeGroupId);
    }
  },
  {
    id: "app:focus-next-pane",
    title: "Focus next pane",
    keywords: ["focus", "pane", "split", "next", "cycle"],
    group: "app",
    when: (ctx) => ctx.auth.showShell && ctx.layout.groupCount > 1,
    run: (ctx) => {
      ctx.layout.focusNextGroup();
    }
  },
  {
    id: "app:go-back",
    title: "Go back",
    keywords: ["history", "back", "previous", "navigate", "tab"],
    group: "app",
    when: (ctx) => {
      const id = ctx.notes.activeTabId;
      return !!id && ctx.layout.canGoBack(id);
    },
    run: (ctx) => {
      const id = ctx.notes.activeTabId;
      if (id) ctx.layout.goBack(id);
    }
  },
  {
    id: "app:go-forward",
    title: "Go forward",
    keywords: ["history", "forward", "next", "navigate", "tab"],
    group: "app",
    when: (ctx) => {
      const id = ctx.notes.activeTabId;
      return !!id && ctx.layout.canGoForward(id);
    },
    run: (ctx) => {
      const id = ctx.notes.activeTabId;
      if (id) ctx.layout.goForward(id);
    }
  },
  {
    id: "app:next-tab",
    title: "Next tab",
    keywords: ["tab", "next", "cycle", "switch"],
    group: "app",
    when: (ctx) => ctx.auth.showShell && !!ctx.notes.activeTabId,
    run: (ctx) => {
      ctx.layout.cycleTab(1);
    }
  },
  {
    id: "app:prev-tab",
    title: "Previous tab",
    keywords: ["tab", "previous", "prev", "cycle", "switch"],
    group: "app",
    when: (ctx) => ctx.auth.showShell && !!ctx.notes.activeTabId,
    run: (ctx) => {
      ctx.layout.cycleTab(-1);
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
    keywords: ["find", "search", "global", "filter", "list"],
    group: "app",
    when: (ctx) => ctx.auth.showShell,
    run: (ctx) => {
      ctx.omnibar.openNotes();
    }
  },
  // In-content find & replace (per tab) — opens the focused tab's find bar via
  // the editor-store `findSignal`. The bar itself (state, keybindings, replace)
  // lives in `FindBar.vue` inside `Editor.vue`; this is the palette entry point
  // (the `Cmd+F` keybinding is wired in `Editor.vue` and hits the focused pane
  // directly). Mirrors `app:search-notes` → `notes.focusSearch()`.
  {
    id: "app:find-in-note",
    title: "Find in note",
    keywords: ["find", "search", "replace", "in note", "editor", "content"],
    group: "app",
    when: (ctx) => !!ctx.editor && ctx.auth.showShell,
    run: (ctx) => {
      ctx.editorStore.requestFind();
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
  },
  {
    id: "app:toggle-note-history",
    title: "Toggle note history",
    keywords: ["history", "versions", "revisions", "timeline", "diff"],
    group: "app",
    when: (ctx) => ctx.auth.showShell,
    run: (ctx) => {
      const id = ctx.layout.activeTab?.id;
      if (id) ctx.layout.toggleHistory(id);
    }
  },
  // Focus mode (multi-window): hides the sidebar AND the notes list for a
  // distraction-free writing surface. The torn-off note window boots with this
  // on; in the main window it's a palette toggle. Overrides the individual
  // collapse flags — toggling it off restores whatever they were.
  {
    id: "app:toggle-focus-mode",
    title: "Toggle focus mode",
    keywords: ["focus", "distraction", "zen", "hide", "sidebar", "list"],
    group: "app",
    when: (ctx) => ctx.auth.showShell,
    run: (ctx) => ctx.shell.toggleFocusMode()
  },
  {
    id: "app:sync-now",
    title: "Sync now",
    keywords: ["sync", "synchronize", "push", "pull", "refresh"],
    group: "app",
    // Sync needs a server account; local mode (skipped login) has no token, so a
    // sync attempt here only fails and — worse — can trip a core logout event
    // that clears the local-mode skip flag. Gate on `isLoggedIn`, not `showShell`.
    when: (ctx) => ctx.auth.isLoggedIn,
    run: (ctx) => {
      void ctx.sync.startSync({ type: "full" });
    }
  },
  // Auto-updater commands (Phase 6.2) — check / download / install over the
  // bridge. `check-updates` is always available in the shell; download/install
  // are gated on the derived snapshot so they only surface when actionable.
  // The actual update is on-site (needs a packaged, signed build + network).
  {
    id: "app:check-updates",
    title: "Check for updates",
    keywords: ["update", "updater", "version", "check", "latest"],
    group: "app",
    when: (ctx) => ctx.auth.showShell,
    run: (ctx) => {
      void ctx.updater.checkForUpdates();
    }
  },
  {
    id: "app:download-update",
    title: "Download update",
    keywords: ["update", "updater", "download", "fetch"],
    group: "app",
    when: (ctx) => ctx.auth.showShell && ctx.updater.updateAvailable,
    run: (ctx) => {
      void ctx.updater.downloadUpdate();
    }
  },
  {
    id: "app:install-update",
    title: "Install update and restart",
    keywords: ["update", "updater", "install", "restart", "quit"],
    group: "app",
    when: (ctx) => ctx.auth.showShell && ctx.updater.readyToInstall,
    run: (ctx) => {
      void ctx.updater.installUpdate();
    }
  },
  // Spell-checker toggle (Phase 6.6) — flips the global Electron session
  // spell-checker. Language/dictionary management is a picker UI (on-site);
  // this is the palette entry point for the on/off switch.
  {
    id: "app:toggle-spell-check",
    title: "Toggle spell check",
    keywords: ["spell", "spellcheck", "spelling", "dictionary", "language"],
    group: "app",
    when: (ctx) => ctx.auth.showShell,
    run: (ctx) => {
      void ctx.spellChecker.toggleSpellCheck(!ctx.spellChecker.enabled);
    }
  },
  // Publish-to-web (monographs) commands — act on the active note. `publish-
  // note` opens the publish dialog; `unpublish-note` confirm-gates then calls
  // `db.monographs.unpublish`; `copy-monograph-url` / `open-monograph-in-
  // browser` use the authoritative server-returned `publishUrl`. Only the
  // applicable one of publish/unpublish shows (gated on `ctx.publish.published`
  // — the publish store reseeds it on active-note switch). The public URL is
  // read from `Monograph.publishUrl` (never hand-constructed) — self-hosters get
  // the correct URL because their API server returns their monograph server's.
  {
    id: "app:publish-note",
    title: "Publish note",
    keywords: ["publish", "monograph", "public", "web", "share"],
    group: "app",
    when: (ctx) => ctx.auth.isLoggedIn && !!ctx.notes.activeNote && !ctx.publish.published,
    run: (ctx) => {
      const note = ctx.notes.activeNote;
      if (!note) return;
      const dialog = usePublishDialogStore();
      void dialog.openCreate(note.id, note.title).then((input) => {
        if (!input) return;
        const { title, ...opts } = input;
        void ctx.publish.publishById(note.id, title, opts);
      });
    }
  },
  {
    id: "app:unpublish-note",
    title: "Unpublish note",
    keywords: ["unpublish", "monograph", "private", "remove", "web"],
    group: "app",
    when: (ctx) => ctx.auth.isLoggedIn && !!ctx.notes.activeNote && ctx.publish.published,
    run: (ctx) => {
      const note = ctx.notes.activeNote;
      if (!note) return;
      const dialog = useDialogStore();
      void dialog
        .confirm({
          title: "Unpublish note",
          message: "This note will no longer be public. The link will stop working.",
          confirmLabel: "Unpublish",
          danger: true
        })
        .then((ok) => {
          if (ok) void ctx.publish.unpublishById(note.id);
        });
    }
  },
  {
    id: "app:copy-monograph-url",
    title: "Copy monograph URL",
    keywords: ["copy", "monograph", "url", "link", "share"],
    group: "app",
    when: (ctx) => ctx.auth.isLoggedIn && !!ctx.notes.activeNote && ctx.publish.published,
    run: (ctx) => {
      const url = ctx.publish.publishUrl;
      if (url) void navigator.clipboard.writeText(url);
    }
  },
  {
    id: "app:open-monograph-in-browser",
    title: "Open monograph in browser",
    keywords: ["open", "monograph", "browser", "web", "view"],
    group: "app",
    when: (ctx) => ctx.auth.isLoggedIn && !!ctx.notes.activeNote && ctx.publish.published,
    run: (ctx) => {
      const url = ctx.publish.publishUrl;
      // `window.open` is intercepted by `setWindowOpenHandler` → `shell.openExternal`,
      // so this opens the system browser, not an in-app window.
      if (url) window.open(url, "_blank", "noopener");
    }
  }
];

/**
 * "Go to <view>" navigation commands (Phase 3.5) — one per sidebar entry in
 * `VIEWS` except Settings, which opens its own window (singleton) via IPC
 * rather than navigating. Visible only when the shell is showing and a router
 * is available.
 */
const navViews = VIEWS.filter((v) => v.name !== "settings");
const gotoCommands: Command[] = navViews.map((v) => ({
  id: `app:goto-${v.name}`,
  title: `Go to ${v.label}`,
  keywords: ["go", "goto", "navigate", "open", "view", v.label.toLowerCase()],
  group: "app",
  // Monographs is hidden in local-only mode — it's the published-notes view,
  // which needs a logged-in account (publishing is a server call). The other
  // views are local-only-safe.
  when: (ctx) =>
    ctx.auth.showShell && !!ctx.router && (v.name !== "monographs" || ctx.auth.isLoggedIn),
  run: (ctx) => {
    ctx.router?.push(v.path);
  }
}));

// Settings opens its own window (singleton) via IPC — never navigates the main
// window (the `/settings` route is top-level and would replace the shell).
const settingsCommand: Command = {
  id: "app:open-settings",
  title: "Open Settings",
  keywords: ["settings", "preferences", "open", "go", "goto"],
  group: "app",
  when: (ctx) => ctx.auth.showShell,
  run: () => {
    void desktop.window.openSettings.mutate().catch(() => undefined);
  }
};

registerCommands([...appCommands, ...gotoCommands, settingsCommand]);