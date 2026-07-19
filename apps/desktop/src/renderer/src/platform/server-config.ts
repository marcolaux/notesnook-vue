/**
 * Server configuration — which Notesnook servers the app talks to.
 *
 * `@notesnook/core`'s `Database.host(hosts)` must be called *before* `db.init()`
 * (see `database.ts`), and the `hosts` bag is one separate per-component URL
 * per entry (`API_HOST`, `AUTH_HOST`, `SSE_HOST`, `SUBSCRIPTIONS_HOST`,
 * `ISSUES_HOST`, `MONOGRAPH_HOST`, `NOTESNOOK_HOST` — the set is whatever the
 * pinned core exports, derived dynamically below) — there is no single
 * discovery URL yet (upstream issue #9670). So a self-hosted setup is expressed
 * as one host per component, mirroring upstream's Settings → Servers.
 *
 * The chosen config is persisted to `localStorage` (it is not a secret) and
 * read at the very start of `bootstrap()` so the right hosts are in place
 * before `db.init()` runs. Switching servers at the login screen writes the
 * new config and reloads (re-initialising the Database against the new hosts);
 * that path only runs while logged-out, so no session is in flight.
 */
import { hosts } from "@notesnook-vue/contracts";

/** The full per-component server-URL bag `Database.host()` expects. */
export type Hosts = typeof hosts;

export type ServerProfile = "notesnook" | "custom";

/** Default Notesnook servers — no customisation. */
export interface NotesnookProfile {
  profile: "notesnook";
}

/** Self-hosted / custom servers — one URL per component. */
export interface CustomProfile {
  profile: "custom";
  hosts: Hosts;
}

export type ServerConfig = NotesnookProfile | CustomProfile;

const CONFIG_KEY = "notesnook.serverConfig";

// Derive the required host keys from the pinned core's `hosts` bag so the
// validator always mirrors whatever set core exports (it grew from 5 to 7 when
// MONOGRAPH_HOST + NOTESNOOK_HOST were added). Hardcoding the list here would
// silently let a custom config missing newer hosts validate.
const HOST_KEYS = Object.keys(hosts) as ReadonlyArray<keyof Hosts>;

/** True when `value` looks like a usable absolute URL with an http(s) scheme. */
function isHostUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.trim() === "") return false;
  try {
    const u = new URL(value.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function isHosts(value: unknown): value is Hosts {
  if (typeof value !== "object" || value === null) return false;
  return HOST_KEYS.every((k) => isHostUrl((value as Record<string, unknown>)[k]));
}

/** Validate a parsed config object; falls back to the notesnook profile on any doubt. */
export function isValidConfig(value: unknown): value is ServerConfig {
  if (typeof value !== "object" || value === null) return false;
  const v = value as { profile?: unknown };
  if (v.profile === "notesnook") return true;
  if (v.profile === "custom") {
    const h = (value as { hosts?: unknown }).hosts;
    return isHosts(h);
  }
  return false;
}

/** Read the persisted server config. Defaults to the notesnook profile. */
export function readServerConfig(): ServerConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return { profile: "notesnook" };
    const parsed = JSON.parse(raw);
    return isValidConfig(parsed) ? parsed : { profile: "notesnook" };
  } catch {
    return { profile: "notesnook" };
  }
}

/** Persist the server config. */
export function writeServerConfig(config: ServerConfig): void {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

/**
 * Resolve a config into the concrete `Hosts` bag `Database.host()` expects.
 * Custom hosts are merged over the defaults so a partial bag still yields a
 * complete one (defensive — the UI always collects all of them).
 */
export function resolveHosts(config: ServerConfig): Hosts {
  if (config.profile === "custom") {
    return { ...hosts, ...config.hosts };
  }
  return { ...hosts };
}

/**
 * The default host values, keyed by component — used to prefill the custom
 * server form so the user edits only what differs for their self-hosted setup.
 */
export function defaultHosts(): Hosts {
  return { ...hosts };
}