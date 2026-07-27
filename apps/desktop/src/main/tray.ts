/**
 * System tray (Phase 6.4). Builds the Electron `Tray` + its context menu from
 * the pure `buildTrayMenuSpec()` and wires each item's click to a `TrayActions`
 * impl. `show`/`quit` are handled in main; `new-note`/`new-notebook` are
 * forwarded to the renderer over the `app:tray-action` IPC channel (the
 * renderer routes them to `notes.create()` / `collections.createNotebook()`).
 *
 * The tray icon is a small embedded 16x16 RGBA PNG (base64) so the feature is
 * self-contained — no asset file to ship. It is a placeholder; a branded icon
 * asset can replace it later (on-site follow-up).
 */
import { app, BrowserWindow, Menu, Tray, nativeImage } from "electron";
import {
  buildTrayMenuSpec,
  type TrayActionId,
  type TrayMenuItemSpec
} from "../contracts/tray";
import { tMain, registerLocaleChangeCallback } from "./i18n";

/** 16x16 dark "note" square with a transparent margin (generated). */
const TRAY_ICON_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAJUlEQVR4nGNgGFRATk7lPzGYIs04DRk1YNQAqhhAiiFYNQ8YAABIRb/1KYLG4QAAAABJRU5ErkJggg==";

/** Actions the tray can trigger. Injected so the wiring is testable in isolation. */
export interface TrayActions {
  newNote(): void;
  newNotebook(): void;
  show(): void;
  quit(): void;
}

let tray: Tray | undefined;
let trayActions: TrayActions | undefined;

/** Build the tray context menu from the pure spec, resolving each item's i18n
 *  key via `tMain` to the active-locale label. */
function buildTrayMenu(actions: TrayActions): Menu {
  const template = buildTrayMenuSpec().map((spec) => toMenuItem(spec, actions));
  return Menu.buildFromTemplate(template);
}

/**
 * Build the tray + menu for `window`. The renderer-side actions
 * (`new-note`/`new-notebook`) are sent to `window.webContents` as
 * `app:tray-action` events; `show`/`quit` act on the window/app directly.
 */
export function registerTray(window: BrowserWindow): Tray {
  const actions: TrayActions = {
    newNote: () => window.webContents.send("app:tray-action", "new-note" satisfies TrayActionId),
    newNotebook: () => window.webContents.send("app:tray-action", "new-notebook" satisfies TrayActionId),
    show: () => {
      if (window.isMinimized()) window.restore();
      window.show();
      window.focus();
    },
    quit: () => app.quit()
  };
  trayActions = actions;

  const icon = nativeImage.createFromBuffer(Buffer.from(TRAY_ICON_PNG_BASE64, "base64"));
  // Mark as a template image on macOS so it adapts to the menu-bar light/dark.
  icon.setTemplateImage(true);

  tray = new Tray(icon);
  tray.setToolTip("Notesnook");
  tray.setContextMenu(buildTrayMenu(actions));

  // Clicking the tray icon (macOS single-click, others left-click) shows the
  // window — the same as the "Show" menu item.
  tray.on("click", () => actions.show());

  return tray;
}

/** Rebuild the tray context menu in the active locale (best-effort). Registered
 *  as a `main/i18n.ts` locale-change callback so a live language switch updates
 *  the tray menu without a restart. */
function rebuildTrayMenu(): void {
  if (!tray || tray.isDestroyed() || !trayActions) return;
  tray.setContextMenu(buildTrayMenu(trayActions));
}

registerLocaleChangeCallback(rebuildTrayMenu);

/** Map a pure spec item to an Electron menu-item constructor. The spec
 *  `label` is an i18n key resolved here via `tMain` to the active-locale text. */
function toMenuItem(spec: TrayMenuItemSpec, actions: TrayActions): Electron.MenuItemConstructorOptions {
  if (spec.separator) {
    return { type: "separator" };
  }
  const id = spec.id;
  return {
    label: spec.label ? tMain(spec.label) : "",
    enabled: spec.enabled !== false,
    click: () => {
      switch (id) {
        case "new-note":
          actions.newNote();
          break;
        case "new-notebook":
          actions.newNotebook();
          break;
        case "show":
          actions.show();
          break;
        case "quit":
          actions.quit();
          break;
        // No default: spec items without a known id render inert (defensive).
      }
    }
  };
}

/** Tear down the tray (e.g. before a new window is created). Safe if none. */
export function destroyTray(): void {
  tray?.destroy();
  tray = undefined;
}