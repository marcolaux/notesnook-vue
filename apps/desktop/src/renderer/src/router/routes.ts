/**
 * Route table + sidebar view definitions (Phase 3.5).
 *
 * `VIEWS` is the single source of truth for the sidebar nav entries and the
 * `app:goto-*` palette commands; `routes` is the matching Vue Router table.
 * Active note id intentionally stays in the notes store (not the URL) for now —
 * `noteId`-in-route is a Phase 4 (multi-tab) / 6.5 (`nn://` deep-link) concern.
 *
 * Route components are **lazy** (`() => import(...)`) so importing the router
 * (incl. in contract tests) does not pull the component/Editor graph, and the
 * renderer code-splits each view.
 */
import type { RouteRecordRaw } from "vue-router";

export const RouteName = {
  login: "login",
  shell: "shell",
  all: "all",
  tasks: "tasks",
  notebooks: "notebooks",
  tags: "tags",
  monographs: "monographs",
  archive: "archive",
  trash: "trash",
  reminders: "reminders",
  settings: "settings"
} as const;

export type RouteName = (typeof RouteName)[keyof typeof RouteName];

/** Sidebar placement — `bottom` groups render after the flex spacer. */
export type ViewPosition = "top" | "bottom";

export interface ViewEntry {
  path: string;
  name: RouteName;
  label: string;
  position: ViewPosition;
  /** Hint shown on the placeholder view (unbuilt collections only). */
  hint?: string;
}

/**
 * Sidebar navigation entries. Order within `position` is preserved. The
 * placeholder `hint` doubles as the "coming in Phase X" copy on unbuilt views.
 */
export const VIEWS: readonly ViewEntry[] = [
  { path: "/all", name: RouteName.all, label: "All Notes", position: "top" },
  { path: "/tasks", name: RouteName.tasks, label: "Tasks", position: "top" },
  {
    path: "/notebooks",
    name: RouteName.notebooks,
    label: "Notebooks",
    position: "top",
    hint: "Notebooks & subnotebooks — coming in Phase 3.2."
  },
  {
    path: "/tags",
    name: RouteName.tags,
    label: "Tags",
    position: "top",
    hint: "Tags & subtags — coming in Phase 3.2."
  },
  {
    path: "/monographs",
    name: RouteName.monographs,
    label: "Monographs",
    position: "top"
  },
  {
    path: "/archive",
    name: RouteName.archive,
    label: "Archive",
    position: "top"
  },
  {
    path: "/reminders",
    name: RouteName.reminders,
    label: "Reminders",
    position: "top"
  },
  {
    path: "/trash",
    name: RouteName.trash,
    label: "Trash",
    position: "bottom"
  },
  { path: "/settings", name: RouteName.settings, label: "Settings", position: "bottom" }
];

export const topViews = VIEWS.filter((v) => v.position === "top");
export const bottomViews = VIEWS.filter((v) => v.position === "bottom");

// Typed route meta for the placeholder views (title/hint).
declare module "vue-router" {
  interface RouteMeta {
    title?: string;
    hint?: string;
  }
}

export const routes: RouteRecordRaw[] = [
  {
    path: "/login",
    name: RouteName.login,
    component: () => import("@/components/LoginScreen.vue")
  },
  {
    path: "/",
    component: () => import("@/components/ShellLayout.vue"),
    children: [
      { path: "", redirect: { name: RouteName.all } },
      {
        path: "all",
        name: RouteName.all,
        component: () => import("@/components/NotesView.vue")
      },
      {
        path: "tasks",
        name: RouteName.tasks,
        component: () => import("@/components/TasksView.vue"),
        meta: { title: "Tasks" }
      },
      {
        path: "notebooks",
        name: RouteName.notebooks,
        component: () => import("@/components/PlaceholderView.vue"),
        meta: { title: "Notebooks", hint: "Notebooks & subnotebooks — coming in Phase 3.2." }
      },
      {
        path: "tags",
        name: RouteName.tags,
        component: () => import("@/components/PlaceholderView.vue"),
        meta: { title: "Tags", hint: "Tags & subtags — coming in Phase 3.2." }
      },
      {
        path: "monographs",
        name: RouteName.monographs,
        component: () => import("@/components/MonographsView.vue"),
        meta: { title: "Monographs" }
      },
      {
        path: "archive",
        name: RouteName.archive,
        component: () => import("@/components/ArchiveView.vue"),
        meta: { title: "Archive" }
      },
      {
        path: "reminders",
        name: RouteName.reminders,
        component: () => import("@/components/RemindersView.vue"),
        meta: { title: "Reminders" }
      },
      {
        path: "trash",
        name: RouteName.trash,
        component: () => import("@/components/TrashView.vue"),
        meta: { title: "Trash" }
      }
    ]
  },
  // Settings is a top-level route (not under ShellLayout) so the separate
  // Settings window — which loads the renderer with `?window=settings` and
  // routes here — renders just the settings form + its own drag titlebar, with
  // no sidebar. The main window never navigates here; it opens the Settings
  // window via `desktop.window.openSettings` instead.
  {
    path: "/settings",
    name: RouteName.settings,
    component: () => import("@/components/SettingsLayout.vue")
  }
];