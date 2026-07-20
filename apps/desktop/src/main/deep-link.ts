/**
 * Main-process deep-link handling (Phase 6.5). Registers the `nn://` custom
 * protocol and routes incoming `nn://note/<id>` URLs to the renderer's existing
 * `app:open-note` channel (exposed by the preload as `window.appEvents.onOpenNote`).
 *
 * Delivery differs by platform:
 * - **macOS**: the OS hands the URL to the running app via the `open-url` event
 *   (for both a warm app and a cold start). The handler must be registered
 *   *before* `app.whenReady()` so a cold-start `open-url` is not lost; it is
 *   queued and flushed once the main window exists.
 * - **Windows / Linux**: a second app instance is launched with the URL in
 *   `argv`. The single primary instance receives it via `second-instance`; a
 *   cold start surfaces it in `process.argv` (scanned in the ready handler).
 *
 * Only `note` targets are dispatched today (the Notes view + `app:open-note`
 * exist). `notebook`/`monograph` targets parse correctly but have no
 * destination view yet (Phase 3.2/6) — they are logged and dropped.
 */
import { app, BrowserWindow } from "electron";
import {
  NN_PROTOCOL,
  parseDeepLink,
  type DeepLinkTarget
} from "../contracts/deep-link";

/** URLs received before a window exists / before its page has loaded. */
const pending: string[] = [];
let mainWindow: BrowserWindow | undefined;
/** Whether the main window's renderer page has finished loading. Deep links
 * sent before this are dropped by Electron (no listener yet), so we queue. */
let rendererLoaded = false;

/** Scan `process.argv` (or any argv) for an `nn://` URL — Win/Linux cold start. */
export function findDeepLinkInArgv(argv: string[]): string | undefined {
  return argv.find((a) => a.startsWith(`${NN_PROTOCOL}://`));
}

/** Register the protocol client (call once the app is ready). */
export function enableDeepLinkProtocol(): void {
  void app.setAsDefaultProtocolClient(NN_PROTOCOL);
}

/**
 * Register the `open-url` (macOS) + `second-instance` (Win/Linux) listeners.
 * Call at module load, BEFORE `app.whenReady()`, so a cold-start `open-url` on
 * macOS is caught and queued rather than dropped.
 */
export function registerDeepLinkListeners(): void {
  // macOS: `open-url` fires for both a warm app and a cold start. Prevent the
  // default (which would otherwise try to load the URL as a file) and queue.
  app.on("open-url", (event, url) => {
    event.preventDefault();
    handleDeepLinkUrl(url);
  });

  // Win/Linux: the primary instance receives the second instance's argv.
  app.on("second-instance", (_event, argv) => {
    const url = findDeepLinkInArgv(argv);
    if (url) handleDeepLinkUrl(url);
  });
}

/** Accept a raw `nn://` URL: parse + dispatch (or queue if no window yet). */
export function handleDeepLinkUrl(url: string): void {
  const target = parseDeepLink(url);
  if (!target) {
    console.warn(`[deep-link] ignoring unhandled URL: ${url}`);
    return;
  }
  dispatch(target, url);
}

/** Bind the main window and flush queued deep links once its page has loaded.
 * Call after `createMainWindow`. */
export function setDeepLinkWindow(win: BrowserWindow): void {
  mainWindow = win;
  const flush = (): void => {
    rendererLoaded = true;
    while (pending.length > 0) {
      const queued = pending.shift();
      if (queued) handleDeepLinkUrl(queued);
    }
  };
  // If the page is already loaded (warm), flush now; otherwise wait for
  // `did-finish-load` so `webContents.send` reaches a subscribed listener.
  if (!win.webContents.isLoading()) flush();
  win.webContents.once("did-finish-load", flush);
}

function dispatch(target: DeepLinkTarget, url: string): void {
  const win = BrowserWindow.getFocusedWindow() ?? mainWindow ?? BrowserWindow.getAllWindows()[0];
  if (!win || !rendererLoaded) {
    // No window yet, or its page hasn't loaded → queue for later.
    pending.push(url);
    return;
  }

  if (target.kind !== "note") {
    // notebook/monograph have no destination view yet (Phase 3.2/6).
    console.warn(`[deep-link] ${target.kind} routing not yet supported: ${url}`);
    return;
  }

  // Bring the window to the front (it may be hidden/minimized) before opening.
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  win.webContents.send("app:open-note", target.id);
}