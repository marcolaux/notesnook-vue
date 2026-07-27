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
 *
 * The "Notesnook (default)" profile MUST use the real production URLs — NOT
 * the `hosts` bag re-exported from `@notesnook/core`. That bag is
 * environment-dependent: core's `hosts` picks its values via `isProduction()`
 * (`process.env.NODE_ENV === "production" || === "test"`), so in `npm run dev`
 * (Vite statically defines `process.env.NODE_ENV` as `"development"` in the
 * renderer, and that literal can't be overridden at runtime) every default host
 * collapses to `http://localhost:5264/8264/…` — where no server runs, so login
 * silently fails in dev. Instead the default profile uses `PRODUCTION_HOSTS`
 * (from `./production-hosts.generated`), a typed constant codegenned from the
 * upstream `hosts` production branch by `scripts/gen-production-hosts.mjs` — so
 * the URLs stay in sync with upstream without hand-maintaining them here, and
 * the default profile is decoupled from `NODE_ENV` (works in dev + packaged).
 */
import { hosts } from "@notesnook-vue/contracts";
import { PRODUCTION_HOSTS } from "./production-hosts.generated";
import type {
  ServerConfig,
  ServerProfile
} from "@contracts/server-config";

export type { ServerConfig, ServerProfile } from "@contracts/server-config";

/** The full per-component server-URL bag `Database.host()` expects. */
export type Hosts = typeof hosts;

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
    // The contract stores custom hosts as a `Record<string,string>` (looser
    // than the renderer's keyed `Hosts`); cast back — `isHosts` validated the
    // keys before the config was ever stored.
    return { ...PRODUCTION_HOSTS, ...(config.hosts as Hosts) };
  }
  return { ...PRODUCTION_HOSTS };
}

/**
 * The default host values, keyed by component — used to prefill the custom
 * server form so the user edits only what differs for their self-hosted setup.
 */
export function defaultHosts(): Hosts {
  return { ...PRODUCTION_HOSTS };
}