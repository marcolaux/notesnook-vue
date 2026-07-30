#!/usr/bin/env node
/**
 * afterPack — ad-hoc sign the packaged macOS `.app` so the "Local Network"
 * privacy permission is grantable.
 *
 * Why this exists (and why `afterSign` does NOT work here): electron-builder v25
 * can't ad-hoc sign — `identity: "-"` is looked up as a cert name and fails, and
 * with no Developer ID cert in the keychain (the repo's release gate) it skips
 * signing entirely, producing an UNSIGNED `.app`. Crucially, electron-builder
 * only invokes the `afterSign` hook when signing actually happened
 * (`platformPackager.js: "skipping afterSign hook as no signing occurred"`),
 * so a no-cert build never reaches `afterSign`. This `afterPack` hook runs
 * unconditionally after packing (before the skipped sign step) and ad-hoc signs
 * the bundle there.
 *
 * Why sign at all: recent macOS (Sonoma/Sequoia) will NOT prompt for — or even
 * list an app under — System Settings → Privacy & Security → Local Network
 * unless (a) the Info.plist carries `NSLocalNetworkUsageDescription` (baked in
 * via `mac.extendInfo` in electron-builder.yml) AND (b) the app is SIGNED, even
 * ad-hoc. An unsigned app is silently denied LAN access and the toggle never
 * appears — the "I cannot set it" symptom after a macOS update. Dev mode is
 * unaffected (it runs under Electron's own signed dev binary).
 *
 * Ad-hoc signing gives a per-build cdhash identity TCC can track, so the
 * Local Network prompt fires on first LAN access and the toggle becomes
 * settable. The identity is content-addressed, so a new build is a "new app"
 * to TCC and the user re-grants once; a Developer ID cert (the deferred release
 * gate, CSC_LINK/CSC_NAME) gives a stable identity so the grant persists across
 * auto-updates. This hook skips itself when a cert is configured so the cert
 * path (electron-builder signs, then applies entitlements directly) is
 * untouched.
 *
 * Wire via `afterPack: scripts/after-pack.mjs` in electron-builder.yml. The
 * loader resolves `.mjs` via dynamic `import()` and calls the default export.
 *
 * @param {{ appOutDir: string; electronPlatformName: string; targets: unknown[] }} ctx
 */
import { execSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENTITLEMENTS = join(__dirname, "..", "entitlements.mac.plist");

function sh(cmd) {
  execSync(cmd, { stdio: "inherit" });
}

export default function afterPack(ctx) {
  // Only the macOS build needs signing; no-op on Windows/Linux.
  const platform = ctx?.electronPlatformName;
  if (platform && platform !== "darwin") return;
  if (process.platform !== "darwin") return;

  // If a real signing identity is configured, leave signing to electron-builder
  // (it signs + applies entitlements itself, and a stable identity persists the
  // Local Network grant across updates). Ad-hoc signing here would just be
  // overwritten by `--force` anyway.
  if (process.env.CSC_LINK || process.env.CSC_NAME) {
    console.log("after-pack: CSC_LINK/CSC_NAME set — leaving signing to electron-builder");
    return;
  }

  if (!existsSync(ENTITLEMENTS)) {
    console.warn(`after-pack: entitlements missing at ${ENTITLEMENTS} — skipping re-sign`);
    return;
  }

  const appOutDir = ctx?.appOutDir;
  if (!appOutDir || !existsSync(appOutDir)) {
    console.warn(`after-pack: appOutDir missing (${appOutDir ?? "undefined"}) — skipping`);
    return;
  }

  const app = readdirSync(appOutDir).find((f) => f.endsWith(".app"));
  if (!app) {
    console.warn(`after-pack: no .app in ${appOutDir} — skipping`);
    return;
  }
  const appPath = join(appOutDir, app);

  // Sign innermost-first: frameworks + helpers before the main bundle. Ad-hoc
  // identity `-` with the Hardened Runtime (`--options runtime`) + entitlements.
  // `--force` overwrites any prior signature. Same entitlements on nested
  // binaries is the standard ad-hoc Electron pattern (JIT/library-validation
  // keys are what the frameworks need; the network keys are inert on non-main
  // executables).
  const sign = (target) =>
    sh(
      `codesign --force --options runtime --entitlements "${ENTITLEMENTS}" --sign - "${target}"`
    );

  console.log(`after-pack: ad-hoc signing ${appPath} (Hardened Runtime + entitlements)…`);
  const frameworksDir = join(appPath, "Contents", "Frameworks");
  if (existsSync(frameworksDir)) {
    for (const entry of readdirSync(frameworksDir)) {
      const target = join(frameworksDir, entry);
      if (entry.endsWith(".app") || /\.(framework|dylib)$/.test(entry)) sign(target);
    }
  }
  // Sign the main bundle last (outermost).
  sign(appPath);

  // Verify — non-fatal; just surface a warning if the seal is broken.
  try {
    execSync(`codesign --verify --deep --strict "${appPath}"`, { stdio: "inherit" });
    console.log("after-pack: signature verified.");
  } catch {
    console.warn("after-pack: codesign --verify failed — the app may still run, but re-signing should be revisited.");
  }
}