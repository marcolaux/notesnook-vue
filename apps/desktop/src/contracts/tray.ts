/**
 * System-tray menu spec (Phase 6.4) — pure, dependency-free, shared by the
 * Electron main process (which builds the real `Tray`/`Menu` from it) and the
 * contract tests.
 *
 * The spec is plain data (ids + labels + separator flags) so it is stable and
 * testable without Electron. The main process maps each spec item to an
 * `MenuItemConstructorOptions` and wires its `click` to the matching
 * `TrayAction`. `show`/`quit` are handled entirely in main; `new-note`/
 * `new-notebook` are forwarded to the renderer over the `app:tray-action` IPC
 * channel (exposed by the preload as `window.appEvents.onTrayAction`).
 */
export type TrayActionId = "new-note" | "new-notebook" | "show" | "quit";

export interface TrayMenuItemSpec {
  /** Action id for clickable items; omitted for separators. */
  id?: TrayActionId;
  /** Display label for clickable items; omitted for separators. */
  label?: string;
  /** Render a separator (divider) instead of a clickable item. */
  separator?: boolean;
  /** Whether the item is clickable. Defaults to `true`. */
  enabled?: boolean;
}

/**
 * The tray menu: New Note, New Notebook, a divider, then Show + Quit. Order is
 * fixed so the contract test can assert it; `show`/`quit` are grouped after the
 * separator to mirror the roadmap's "New Note / New Notebook / Show / Quit".
 */
export function buildTrayMenuSpec(): TrayMenuItemSpec[] {
  return [
    { id: "new-note", label: "New Note" },
    { id: "new-notebook", label: "New Notebook" },
    { separator: true },
    { id: "show", label: "Show" },
    { id: "quit", label: "Quit" }
  ];
}