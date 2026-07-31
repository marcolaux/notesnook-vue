/**
 * App-level commands (Phase 2.5). Registered on import (see `./index`). These
 * cover shell actions not bound to the editor — note lifecycle, tabs, auth,
 * reload, and sidebar navigation (Phase 3.5). Editor actions live in
 * `./editor-commands`.
 */
import { registerCommands } from "./registry";
import type { Command, CommandContext } from "./registry";
import { VIEWS } from "@/router/routes";
import { desktop } from "@/platform/desktop-bridge";
import { readCurrentContext } from "@/platform/account-context";
import { getCurrentContext } from "@/platform/bootstrap";
import { usePublishDialogStore } from "@/stores/publish-dialog";
import { useDialogStore } from "@/stores/dialog";
import { useTemplatesStore } from "@/stores/templates";
import { useContextMenuStore } from "@/stores/context-menu";
import { usePropertiesStore } from "@/stores/properties";
import { useEditorStore } from "@/stores/editor";
import { useSettingsStore } from "@/stores/settings";
import { useDailyNotesStore } from "@/stores/daily-notes";
import { todayIso } from "@/utils/daily-notes";
import { blockIdAtSelection } from "@/utils/editor-block-link";
import { createInternalLink } from "@notesnook-vue/editor-vue";
import {
  buildColorSubmenu,
  buildTagsSubmenu,
  buildNotebooksSubmenu,
  type NoteMenuTarget
} from "@/utils/context-menu-entries";
import { buildActiveNoteAssignmentDeps } from "@/utils/assignment-menu";
import { rebuildSearchIndexWithConfirm } from "@/utils/rebuild-search-index";
import { useNavHistoryStore } from "@/stores/nav-history";
import { nextTick, watch } from "vue";
import { logger } from "@/utils/logger";
import i18n from "@/i18n";

const t = i18n.global.t.bind(i18n.global);

/**
 * Build a {@link NoteMenuTarget} snapshot for the active note (seeded from the
 * Properties store's loaded assignments so the submenu ✓ states are correct),
 * wire the assignment deps to the stores, then open the matching Color/Tags/
 * Notebooks submenu as a standalone centered popup. Shared by the three
 * `app:add-*` / `app:assign-color` commands below.
 */
function openAssignmentSubmenu(ctx: CommandContext, kind: "notebook" | "tag" | "color"): void {
  const note = ctx.notes.activeNote;
  if (!note) return;
  const properties = usePropertiesStore();
  const target: NoteMenuTarget = {
    id: note.id,
    title: note.title,
    pinned: note.pinned,
    favorite: note.favorite,
    published: ctx.publish.published,
    colorId: properties.color?.id ?? null,
    tagIds: properties.tags.map((tg) => tg.id),
    notebookIds: properties.notebooks.map((n) => n.id)
  };
  const deps = buildActiveNoteAssignmentDeps(target);
  const spec =
    kind === "notebook"
      ? buildNotebooksSubmenu(target, deps)
      : kind === "tag"
        ? buildTagsSubmenu(target, deps)
        : buildColorSubmenu(target, deps);
  const menu = useContextMenuStore();
  // Capture the focused pane's editor NOW — while the palette still has DOM
  // focus, the editor is blurred but ProseMirror keeps its selection, and
  // `useEditorStore().editor` still resolves to the pane the user was editing
  // in (the palette does not change the focused pane key). After the standalone
  // submenu closes we refocus that editor so the caret returns to exactly
  // where it was — without this the editor stays blurred after the assignment.
  const editor = useEditorStore().editor;
  menu.showSubmenu(
    spec,
    Math.floor(window.innerWidth / 2),
    Math.floor(window.innerHeight / 2)
  );
  if (!editor) return;
  const stop = watch(() => menu.open, (isOpen) => {
    if (isOpen) return;
    stop();
    // Defer past the overlay's unmount + the palette's close so the focus
    // isn't immediately stolen back by a teardown handler.
    void nextTick(() => editor.commands.focus());
  });
}

const appCommands: Command[] = [
  {
    id: "app:new-note",
    title: "command.newNote",
    keywords: ["create", "add", "note"],
    group: "app",
    run: (ctx) => {
      void ctx.notes.create();
    }
  },
  {
    id: "app:new-task",
    title: "command.newTask",
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
    title: "command.newTemplate",
    keywords: ["template", "create", "new"],
    group: "app",
    when: (ctx) => ctx.auth.showShell,
    run: () => {
      void useTemplatesStore().createTemplate();
    }
  },
  {
    id: "app:save-as-template",
    title: "command.saveAsTemplate",
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
    title: "command.removeTemplate",
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
    title: "command.closeTab",
    keywords: ["tab", "close", "editor"],
    group: "app",
    when: (ctx) => !!ctx.notes.activeTabId,
    run: (ctx) => {
      const id = ctx.notes.activeTabId;
      if (id) ctx.notes.closeTab(id);
    }
  },
  // Reopen the most recently closed tab (browser-style). Pairs with the menubar
  // File → "Reopen Closed Tab" (`Cmd/Ctrl+Shift+T`) entry; both call the
  // editor-layout store's closed-tab stack. Disabled while the stack is empty.
  {
    id: "app:reopen-closed-tab",
    title: "command.reopenClosedTab",
    keywords: ["reopen", "closed", "tab", "restore", "undo"],
    group: "app",
    when: (ctx) => ctx.layout.closedTabs.length > 0,
    run: (ctx) => ctx.layout.reopenClosedTab()
  },
  {
    id: "app:close-tab-and-trash",
    title: "command.closeTabAndTrash",
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
    title: "command.splitEditorRight",
    keywords: ["split", "pane", "vertical", "right", "side"],
    group: "app",
    when: (ctx) => ctx.auth.showShell,
    run: (ctx) => {
      ctx.layout.splitGroup("vertical");
    }
  },
  {
    id: "app:split-horizontal",
    title: "command.splitEditorDown",
    keywords: ["split", "pane", "horizontal", "down", "below"],
    group: "app",
    when: (ctx) => ctx.auth.showShell,
    run: (ctx) => {
      ctx.layout.splitGroup("horizontal");
    }
  },
  {
    id: "app:close-pane",
    title: "command.closeEditorPane",
    keywords: ["split", "pane", "close", "collapse"],
    group: "app",
    when: (ctx) => ctx.auth.showShell && ctx.layout.groupCount > 1,
    run: (ctx) => {
      ctx.layout.closeGroup(ctx.layout.activeGroupId);
    }
  },
  // Detach the focused pane into its own window (Phase 4.6). Captures the pane's
  // snapshot, asks main to open a pane window for it, then closes the pane here
  // (the snapshot carries the tabs; `closeGroup` drops them from the source +
  // collapses the split). Also exposed via the pane tab-strip grip + context
  // menu (`NoteTabs.vue`); this is the palette + keyboard entry point
  // (`Cmd/Ctrl+Shift+K`, wired in `use-tab-shortcuts`). Shown only when the
  // focused pane has portable (note/attachment) tabs — an empty or search-only
  // pane has nothing to detach.
  {
    id: "app:detach-pane",
    title: "command.detachPane",
    keywords: ["detach", "pane", "window", "tear", "off", "split", "pop", "out"],
    group: "app",
    when: (ctx) =>
      ctx.auth.showShell &&
      ctx.layout.tabsOf(ctx.layout.activeGroupId).some((t) => t.kind !== "search"),
    run: (ctx) => {
      const groupId = ctx.layout.activeGroupId;
      const snapshot = ctx.layout.detachGroupSnapshot(groupId);
      if (!snapshot) return;
      const contextId = readCurrentContext();
      void desktop.window.openPaneWindow.mutate({ snapshot, contextId });
      ctx.layout.closeGroup(groupId, true);
    }
  },
  {
    id: "app:focus-next-pane",
    title: "command.focusNextPane",
    keywords: ["focus", "pane", "split", "next", "cycle"],
    group: "app",
    when: (ctx) => ctx.auth.showShell && ctx.layout.groupCount > 1,
    run: (ctx) => {
      ctx.layout.focusNextGroup();
    }
  },
  {
    id: "app:go-back",
    title: "command.goBack",
    keywords: ["history", "back", "previous", "navigate"],
    group: "app",
    when: () => useNavHistoryStore().canBack,
    run: () => {
      useNavHistoryStore().back();
    }
  },
  {
    id: "app:go-forward",
    title: "command.goForward",
    keywords: ["history", "forward", "next", "navigate"],
    group: "app",
    when: () => useNavHistoryStore().canForward,
    run: () => {
      useNavHistoryStore().forward();
    }
  },
  {
    id: "app:next-tab",
    title: "command.nextTab",
    keywords: ["tab", "next", "cycle", "switch"],
    group: "app",
    when: (ctx) => ctx.auth.showShell && !!ctx.notes.activeTabId,
    run: (ctx) => {
      ctx.layout.cycleTab(1);
    }
  },
  {
    id: "app:prev-tab",
    title: "command.previousTab",
    keywords: ["tab", "previous", "prev", "cycle", "switch"],
    group: "app",
    when: (ctx) => ctx.auth.showShell && !!ctx.notes.activeTabId,
    run: (ctx) => {
      ctx.layout.cycleTab(-1);
    }
  },
  {
    id: "app:sign-out",
    title: "command.logOut",
    keywords: ["logout", "sign out", "account"],
    group: "app",
    when: (ctx) => ctx.auth.isLoggedIn,
    run: (ctx) => {
      void ctx.auth.logout();
    }
  },
  {
    id: "app:sign-in",
    title: "command.signIn",
    keywords: ["login", "log in", "account"],
    group: "app",
    when: (ctx) => !ctx.auth.isLoggedIn,
    run: (ctx) => {
      ctx.auth.requestSignIn();
    }
  },
  {
    id: "app:reload",
    title: "command.reloadWindow",
    keywords: ["refresh", "restart"],
    group: "app",
    run: () => {
      location.reload();
    }
  },
  {
    id: "app:search-notes",
    title: "command.searchNotes",
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
    title: "command.findInNote",
    keywords: ["find", "search", "replace", "in note", "editor", "content"],
    group: "app",
    when: (ctx) => !!ctx.editor && ctx.auth.showShell,
    run: (ctx) => {
      ctx.editorStore.requestFind();
    }
  },
  // Show the proactive notebook/tag/color suggestions overlay for the focused
  // note. The overlay itself (`NoteSuggestions.vue` + `use-note-suggestions`)
  // normally auto-appears after a typing pause when an unorganized note has
  // enough content; this is the on-demand entry point — it clears any dismissal
  // and re-runs the engine immediately. Mirrors `app:find-in-note` →
  // `editorStore.requestFind()` (a per-pane signal the focused `Editor.vue`
  // watches).
  {
    id: "app:show-note-suggestions",
    title: "command.showNoteSuggestions",
    keywords: ["suggest", "suggestions", "notebook", "tag", "color", "related", "organize"],
    group: "app",
    when: (ctx) => !!ctx.editor && ctx.auth.showShell,
    run: (ctx) => {
      ctx.editorStore.requestSuggestions();
    }
  },
  // Open today's daily note — navigates to the `/daily` view (so the date
  // timeline is visible) and opens today's note via `openDailyNote`, which
  // reveals a prefilled draft when no daily note exists yet (lazy creation on
  // first content). Also bound to `Cmd/Ctrl+D` in `use-tab-shortcuts`.
  {
    id: "app:open-today-daily-note",
    title: "command.openTodayDailyNote",
    keywords: ["today", "daily", "note", "journal", "open", "date"],
    group: "app",
    when: (ctx) => ctx.auth.showShell,
    run: (ctx) => {
      void ctx.router?.push("/daily").then(() => useDailyNotesStore().openDailyNote(todayIso()));
    }
  },
  // Pane/panel toggle commands (Phase 5.3) — the toolbar + "rest over command
  // palette" entry points for collapsing the sidebar / list and showing the
  // right-side ToC + properties panels. The panel UI itself is on-site.
  {
    id: "app:toggle-sidebar",
    title: "command.toggleSidebar",
    keywords: ["sidebar", "collapse", "navigation"],
    group: "app",
    when: (ctx) => ctx.auth.showShell,
    run: (ctx) => ctx.shell.toggleSidebar()
  },
  {
    id: "app:toggle-list",
    title: "command.toggleNotesList",
    keywords: ["list", "collapse", "notes"],
    group: "app",
    when: (ctx) => ctx.auth.showShell,
    run: (ctx) => ctx.shell.toggleList()
  },
  {
    id: "app:toggle-toc",
    title: "command.toggleToc",
    keywords: ["toc", "outline", "headings", "minimap"],
    group: "app",
    when: (ctx) => ctx.auth.showShell,
    run: (ctx) => {
      const id = ctx.layout.activeTab?.id;
      if (id) ctx.layout.toggleToc(id);
    }
  },
  {
    id: "app:toggle-properties",
    title: "command.toggleProperties",
    keywords: ["properties", "panel", "info", "metadata"],
    group: "app",
    when: (ctx) => ctx.auth.showShell,
    run: (ctx) => ctx.shell.toggleProperties()
  },
  // "Add to notebook / tag / Assign color" — open the same Color/Tags/Notebooks
  // submenus the notes-list right-click uses, as a standalone centered popup
  // (see `stores/context-menu.ts` `showSubmenu`). The assignment deps are wired
  // to the Properties/Collections/Colors stores for the active note; the submenu
  // builders' search / create / multi-toggle / preset behaviour is reused
  // verbatim. The omnibar closes the palette after `run`, then the popup opens.
  {
    id: "app:add-to-notebook",
    title: "command.addToNotebook",
    keywords: ["notebook", "add", "assign", "move", "organize", "folder"],
    group: "app",
    when: (ctx) => ctx.auth.showShell && !!ctx.notes.activeNote,
    run: (ctx) => openAssignmentSubmenu(ctx, "notebook")
  },
  {
    id: "app:add-tag",
    title: "command.addTag",
    keywords: ["tag", "add", "assign", "label", "categorize"],
    group: "app",
    when: (ctx) => ctx.auth.showShell && !!ctx.notes.activeNote,
    run: (ctx) => openAssignmentSubmenu(ctx, "tag")
  },
  {
    id: "app:assign-color",
    title: "command.assignColor",
    keywords: ["color", "assign", "label", "swatch", "tint", "highlight"],
    group: "app",
    when: (ctx) => ctx.auth.showShell && !!ctx.notes.activeNote,
    run: (ctx) => openAssignmentSubmenu(ctx, "color")
  },
  {
    id: "app:toggle-note-history",
    title: "command.toggleNoteHistory",
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
    title: "command.toggleFocusMode",
    keywords: ["focus", "distraction", "zen", "hide", "sidebar", "list"],
    group: "app",
    when: (ctx) => ctx.auth.showShell,
    run: (ctx) => ctx.shell.toggleFocusMode()
  },
  // Open a NEW full-shell window bound to THIS window's account context, via
  // the `window.openAccountWindow` tRPC bridge (same path the account switcher's
  // "Open in new window" uses). Pairs with the menubar File → "New Window"
  // (`Cmd/Ctrl+Shift+N`) entry, which calls the main-side function directly.
  {
    id: "app:new-window",
    title: "command.newWindow",
    keywords: ["window", "new", "open", "account"],
    group: "app",
    when: (ctx) => ctx.auth.showShell,
    run: (ctx) => ctx.auth.openAccountInNewWindow(getCurrentContext())
  },
  {
    id: "app:sync-now",
    title: "command.syncNow",
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
    title: "command.checkForUpdates",
    keywords: ["update", "updater", "version", "check", "latest"],
    group: "app",
    when: (ctx) => ctx.auth.showShell,
    run: (ctx) => {
      void ctx.updater.checkForUpdates();
    }
  },
  {
    id: "app:download-update",
    title: "command.downloadUpdate",
    keywords: ["update", "updater", "download", "fetch"],
    group: "app",
    when: (ctx) => ctx.auth.showShell && ctx.updater.updateAvailable,
    run: (ctx) => {
      void ctx.updater.downloadUpdate();
    }
  },
  {
    id: "app:install-update",
    title: "command.installUpdateRestart",
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
    title: "command.toggleSpellCheck",
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
    title: "command.publishNote",
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
  // "Update published note" — republish an already-published note to push its
  // latest content to the existing public page. Opens the publish dialog
  // seeded for an edit (title prefilled, selfDestruct from the persisted
  // `Monograph` row, password empty with a "leave blank to keep" hint). On
  // confirm, `publishById` re-runs `db.monographs.publish`, which core treats
  // as a PATCH (update) because the note is already published. Only shown when
  // the active note is published (the inverse of `app:publish-note`).
  {
    id: "app:update-monograph",
    title: "command.updateMonograph",
    keywords: ["update", "republish", "monograph", "public", "web", "publish", "refresh"],
    group: "app",
    when: (ctx) => ctx.auth.isLoggedIn && !!ctx.notes.activeNote && ctx.publish.published,
    run: (ctx) => {
      const note = ctx.notes.activeNote;
      if (!note) return;
      const dialog = usePublishDialogStore();
      void dialog
        .openEdit(note.id, note.title, { selfDestruct: ctx.publish.selfDestruct })
        .then((input) => {
          if (!input) return;
          const { title, ...opts } = input;
          void ctx.publish.publishById(note.id, title, opts);
        });
    }
  },
  {
    id: "app:unpublish-note",
    title: "command.unpublishNote",
    keywords: ["unpublish", "monograph", "private", "remove", "web"],
    group: "app",
    when: (ctx) => ctx.auth.isLoggedIn && !!ctx.notes.activeNote && ctx.publish.published,
    run: (ctx) => {
      const note = ctx.notes.activeNote;
      if (!note) return;
      const dialog = useDialogStore();
      void dialog
        .confirm({
          title: t("editorToolbar.unpublishConfirmTitle"),
          message: t("editorToolbar.unpublishConfirmMsg"),
          confirmLabel: t("editorToolbar.unpublishConfirmLabel"),
          danger: true
        })
        .then((ok) => {
          if (ok) void ctx.publish.unpublishById(note.id);
        });
    }
  },
  {
    id: "app:copy-monograph-url",
    title: "command.copyMonographUrl",
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
    title: "command.openMonographInBrowser",
    keywords: ["open", "monograph", "browser", "web", "view"],
    group: "app",
    when: (ctx) => ctx.auth.isLoggedIn && !!ctx.notes.activeNote && ctx.publish.published,
    run: (ctx) => {
      const url = ctx.publish.publishUrl;
      // `window.open` is intercepted by `setWindowOpenHandler` → `shell.openExternal`,
      // so this opens the system browser, not an in-app window.
      if (url) window.open(url, "_blank", "noopener");
    }
  },
  {
    id: "app:copy-block-link",
    title: "command.copyBlockLink",
    keywords: ["copy", "link", "block", "deep", "share", "url"],
    group: "editor",
    // `ctx.editor` is the focused pane's editor; its selection pairs with the
    // active note, so the block id targets the note the user is looking at.
    when: (ctx) => !!ctx.editor && !!ctx.notes.activeNote,
    run: (ctx) => {
      const id = ctx.notes.activeNote?.id;
      if (!id || !ctx.editor) return;
      const blockId = blockIdAtSelection(ctx.editor);
      const href = createInternalLink("note", id, blockId ? { blockId } : {});
      void navigator.clipboard.writeText(href).catch(() => {
        /* clipboard unavailable — ignore */
      });
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
  // Snapshot the resolved label at registration (`t(v.label)` is a routes.* key;
  // `command.goTo` interpolates it). Re-registered only on app reload, so a
  // locale switch won't live-update these labels — accepted trade-off (the
  // static command titles do update via the omnibar `te`/`t` resolver).
  title: t("command.goTo", { label: t(v.label) }),
  keywords: ["go", "goto", "navigate", "open", "view", t(v.label).toLowerCase()],
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
  title: "command.openSettings",
  keywords: ["settings", "preferences", "open", "go", "goto"],
  group: "app",
  when: (ctx) => ctx.auth.showShell,
  run: () => {
    void desktop.window.openSettings.mutate({ contextId: getCurrentContext() }).catch(() => undefined);
  }
};

registerCommands([...appCommands, ...gotoCommands, settingsCommand]);

// Rebuild the FTS5 lexical search index. Repopulates `notes_fts` + `content_fts`
// from existing notes/content. Fixes the reported bug where lexical search
// misses words in the TITLES of older notes: those notes' titles were never
// backfilled into `notes_fts` (the `a-2025-06-04` migration's backfill didn't
// run for an existing DB), while `content_fts` was populated — so body search
// worked but title search didn't. New notes are fine (triggers index them);
// this repairs the pre-existing ones. Idempotent + safe. The confirm + feedback
// flow lives in the shared util (also used by the Search settings section).
const rebuildSearchIndexCommand: Command = {
  id: "app:rebuild-search-index",
  title: "command.rebuildSearchIndex",
  keywords: ["search", "index", "rebuild", "reindex", "fts", "fix", "title"],
  group: "app",
  when: (ctx) => ctx.auth.showShell,
  run: () => {
    void rebuildSearchIndexWithConfirm();
  }
};
registerCommands([rebuildSearchIndexCommand]);

// Theme commands. `toggle-theme` flips between explicit light and dark; when
// the current mode is `system` it resolves the OS colour scheme first so the
// flip is always to the *other* visible theme. `toggle-os-theme` enables
// "follow OS theme" and is hidden once active (a one-way command — to leave
// OS mode you toggle light/dark, which pins an explicit theme). Both read
// `settings.themeMode` inside `when`, so the omnibar's `visibleCommands`
// computed re-evaluates live as the mode changes.
registerCommands([
  {
    id: "app:toggle-theme",
    title: "command.toggleTheme",
    keywords: ["theme", "light", "dark", "appearance", "mode", "toggle", "color", "colour"],
    group: "app",
    when: (ctx) => ctx.auth.showShell,
    run: () => {
      const s = useSettingsStore();
      const current = s.themeMode;
      const effectiveDark =
        current === "dark" ||
        (current === "system" &&
          typeof window !== "undefined" &&
          window.matchMedia &&
          window.matchMedia("(prefers-color-scheme: dark)").matches);
      s.setThemeMode(effectiveDark ? "light" : "dark");
    }
  },
  {
    id: "app:toggle-os-theme",
    title: "command.toggleOsTheme",
    keywords: ["theme", "system", "os", "auto", "follow", "appearance", "mode", "operating"],
    group: "app",
    when: (ctx) => ctx.auth.showShell && useSettingsStore().themeMode !== "system",
    run: () => {
      useSettingsStore().setThemeMode("system");
    }
  }
]);