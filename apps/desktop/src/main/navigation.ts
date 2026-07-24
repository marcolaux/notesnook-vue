/**
 * Main-process navigation security & external link handling.
 *
 * Ensures all external URLs (http, https, mailto, tel, etc.) opened from ANY app window
 * (main window, settings window, note windows, popups, webviews) are intercepted and opened
 * in the user's default system browser via Electron's `shell.openExternal`, rather than
 * navigating internal Electron windows or creating embedded web views.
 *
 * `nn://` / `notesnook://` deep links are routed to `handleDeepLinkUrl`.
 * Internal app URLs (`file://`, `devtools://`, `about:`, or dev server URL) are permitted
 * to navigate within Electron windows.
 */
import { app, shell, type WebContents } from "electron";
import { handleDeepLinkUrl } from "./deep-link";

/**
 * Determine if a URL is an internal deep link (`nn://` or `notesnook://`).
 */
export function isDeepLinkUrl(urlStr: string): boolean {
  if (!urlStr) return false;
  return urlStr.startsWith("nn://") || urlStr.startsWith("notesnook://");
}

/**
 * Determine if a URL is an external web/protocol URL that should open in the system browser.
 */
export function isExternalUrl(urlStr: string): boolean {
  if (!urlStr) return false;

  if (isDeepLinkUrl(urlStr)) {
    return false;
  }

  try {
    const url = new URL(urlStr);

    // Dev server URL check (e.g. http://localhost:5173)
    const devUrl = process.env["ELECTRON_RENDERER_URL"];
    if (devUrl) {
      try {
        const parsedDev = new URL(devUrl);
        if (url.origin === parsedDev.origin) {
          return false;
        }
      } catch {
        /* ignore invalid dev URL env */
      }
    }

    // Internal protocols
    if (
      url.protocol === "file:" ||
      url.protocol === "devtools:" ||
      url.protocol === "about:"
    ) {
      return false;
    }

    // Standard external web/messaging protocols
    if (
      url.protocol === "http:" ||
      url.protocol === "https:" ||
      url.protocol === "mailto:" ||
      url.protocol === "tel:" ||
      url.protocol === "ftp:"
    ) {
      return true;
    }

    // Treat unrecognized custom schemes as external by default
    return true;
  } catch {
    return false;
  }
}

/**
 * Attach window open and navigation event handlers to a `WebContents` instance.
 */
export function setupExternalNavigation(contents: WebContents): void {
  // Intercept new window requests (e.g. `target="_blank"`, `window.open`)
  contents.setWindowOpenHandler(({ url }) => {
    if (isDeepLinkUrl(url)) {
      handleDeepLinkUrl(url);
      return { action: "deny" };
    }
    if (isExternalUrl(url)) {
      void shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  // Intercept top-level in-window navigation (e.g. `<a href="..." target="_self">` or `location.href = ...`)
  contents.on("will-navigate", (event, url) => {
    if (isDeepLinkUrl(url)) {
      event.preventDefault();
      handleDeepLinkUrl(url);
      return;
    }
    if (isExternalUrl(url)) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });

  // Intercept sub-frame / frame navigations
  contents.on("will-frame-navigate", (event) => {
    if (isDeepLinkUrl(event.url)) {
      event.preventDefault();
      handleDeepLinkUrl(event.url);
      return;
    }
    if (isExternalUrl(event.url)) {
      event.preventDefault();
      void shell.openExternal(event.url);
    }
  });
}

/**
 * Register global web-contents-created hook so EVERY window or frame created
 * in Electron enforces external link handling automatically.
 */
export function registerNavigationSecurity(): void {
  app.on("web-contents-created", (_event, contents) => {
    setupExternalNavigation(contents);
  });
}
