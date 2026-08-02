<script setup lang="ts">
/**
 * Settings window layout — the root rendered by the separate Settings
 * `BrowserWindow` (top-level `/settings` route). A minimal drag titlebar (no
 * sidebar toggle — Settings has its own section nav) + a two-pane body: a left
 * nav of section groups and a right content pane showing the active section.
 *
 * The sidebar is split into a **Global** group (device-wide sections: Sync,
 * Backup, Import, Updates) and **one group per account** (Local + every
 * logged-in account, enumerated from the account registry), each exposing the
 * per-account sections — Appearance, Language, Notes, Search, Attachments,
 * Vault. Attachments lives per-account because attachment data is stored in the
 * account's own encrypted DB (the section browses the active context's
 * `db.attachments`), so it follows the same live-context-swap as the other
 * per-account sections. Clicking a per-account section switches the window's
 * context in place (live-swap the DB singleton + reload the per-account client
 * prefs) so each account keeps its own values; the same section components render
 * under every account, reading the stores / active DB which are context-aware.
 *
 * Padding reuses `useTitleBarStore` so the drag label clears the OS-drawn window
 * controls (macOS traffic lights / Windows WCO), matching the main window's
 * `TitleBar`. The section nav uses the same glassmorphism tokens as the main
 * `Sidebar`, so the acrylic/vibrancy shows through and the active/hover states
 * read identically in both themes.
 *
 * Sections are self-contained components under `components/settings-sections/`.
 * The nav config below (`globalSections` + `accountSections`) is the single
 * place to register a section. The Vault nav item is always shown so a user with
 * no vault can create one.
 */
import { ref, computed, onMounted, watch, type Component } from "vue";
import { useI18n } from "vue-i18n";
import { useTitleBarStore } from "@/stores/titlebar";
import { useAuthStore } from "@/stores/auth";
import { useSettingsStore } from "@/stores/settings";
import { useConfigStore } from "@/stores/config";
import { getCurrentContext } from "@/platform/bootstrap";
import { listAccounts } from "@/platform/account-registry";
import { LOCAL_CONTEXT, type ContextId } from "@/platform/account-context";
import { reloadLocale } from "@/i18n";
import { reloadBlockColorize } from "@/stores/block-colorize";
import type { AccountEntry } from "@contracts/server-config";
import AppearanceSection from "./settings-sections/AppearanceSection.vue";
import LanguageSection from "./settings-sections/LanguageSection.vue";
import NotesSection from "./settings-sections/NotesSection.vue";
import SearchSection from "./settings-sections/SearchSection.vue";
import VaultSection from "./settings-sections/VaultSection.vue";
import SyncSection from "./settings-sections/SyncSection.vue";
import BackupSection from "./settings-sections/BackupSection.vue";
import ImportSection from "./settings-sections/ImportSection.vue";
import AttachmentsSection from "./settings-sections/AttachmentsSection.vue";
import UpdatesSection from "./settings-sections/UpdatesSection.vue";

const titlebar = useTitleBarStore();
const { t } = useI18n();
const auth = useAuthStore();
const settings = useSettingsStore();
const config = useConfigStore();

// --- Account context (per-window multi-account) ---------------------------
// The Settings window operates on the current context's DB; the sidebar lists
// every account (Local + registry) so the user can edit each account's
// per-account settings without a titlebar switcher. `activeContext` mirrors the
// live in-process context; `activeSection` is the section within the active
// group. Navigating to a per-account section under a different account
// live-swaps the context in place (`switchContext`).
const activeContext = ref<ContextId>(getCurrentContext());
const accounts = ref<AccountEntry[]>([]);

async function refreshAccounts(): Promise<void> {
  accounts.value = await listAccounts();
}

/** Switch the Settings window to a different account context in place. Reuses
 *  `auth.switchToAccount` (live-swaps the DB singleton, writes the shared
 *  `currentContext` pointer + serverConfig), then re-runs `settings.load()` so
 *  the db.settings-backed values reflect the new account AND reloads the
 *  per-account client prefs (theme/transparency/locale/templates/block-colorize)
 *  which are keyed by context in localStorage. The auth store's
 *  `contextChangeSignal` bump is a no-op here (the main-window watch that reacts
 *  to it never runs in the Settings branch), hence the manual reload. */
async function switchContext(contextId: string): Promise<void> {
  const ok = await auth.switchToAccount(contextId);
  if (!ok) return;
  await settings.load();
  settings.loadClientPrefs();
  config.loadClientPrefs();
  reloadBlockColorize();
  reloadLocale();
  activeContext.value = getCurrentContext();
}

// Keep activeContext in sync if the context changes elsewhere (e.g. an external
// singleton reload re-boots Settings into a new `?ctx`). The signal bumps inside
// `switchToAccount`; `getCurrentContext()` reads the live value.
watch(
  () => auth.contextChangeSignal,
  () => {
    activeContext.value = getCurrentContext();
  }
);

interface SectionItem {
  id: string;
  /** i18n key under `settings.sections.*`. */
  label: string;
  component: Component;
  /** Optional visibility gate (rarely used now that Vault is always shown). */
  visible?: () => boolean;
}
interface SectionGroup {
  /** Stable key for `:key` (the contextId for account groups, `"global"` otherwise). */
  key: string;
  /** Display text for the uppercase group header. */
  groupLabel: string;
  /** The contextId this group's sections operate on, or `undefined` for the
   *  device-wide Global group (whose sections never switch context). */
  contextId?: string | undefined;
  items: SectionItem[];
}

/** Per-account sections — rendered under every account group. Attachments is
 *  per-account because its data lives in the account's own encrypted DB. */
const accountSections: SectionItem[] = [
  { id: "appearance", label: "settings.sections.appearance", component: AppearanceSection },
  { id: "language", label: "settings.sections.language", component: LanguageSection },
  { id: "notes", label: "settings.sections.notes", component: NotesSection },
  { id: "search", label: "settings.sections.search", component: SearchSection },
  { id: "attachments", label: "settings.sections.attachments", component: AttachmentsSection },
  { id: "vault", label: "settings.sections.vault", component: VaultSection }
];
/** Device-wide sections — the Global group. */
const globalSections: SectionItem[] = [
  { id: "sync", label: "settings.sections.sync", component: SyncSection },
  { id: "backup", label: "settings.sections.backup", component: BackupSection },
  { id: "import", label: "settings.sections.import", component: ImportSection },
  { id: "updates", label: "settings.sections.updates", component: UpdatesSection }
];

/** The Global group first, then one group per account (Local first, then each
 *  logged-in account newest-first as `listAccounts` returns). Rebuilt when the
 *  account registry changes. */
const groups = computed<SectionGroup[]>(() => [
  {
    key: "global",
    groupLabel: t("settings.groups.global"),
    contextId: undefined,
    items: globalSections
  },
  {
    key: LOCAL_CONTEXT,
    groupLabel: t("sidebar.localOnly"),
    contextId: LOCAL_CONTEXT,
    items: accountSections
  },
  ...accounts.value.map((a) => ({
    key: a.contextId,
    groupLabel: a.email,
    contextId: a.contextId,
    items: accountSections
  }))
]);

/** Groups with their gate-hidden items filtered out; empty groups dropped. */
const visibleGroups = computed(() =>
  groups.value
    .map((g) => ({ ...g, items: g.items.filter((it) => !it.visible || it.visible()) }))
    .filter((g) => g.items.length > 0)
);

/** All known section ids — used to validate a `?section=` deep-link query. */
const knownIds = computed(() => new Set(groups.value.flatMap((g) => g.items.map((it) => it.id))));

const activeSection = ref("appearance");

/** The component for the active section. Account groups only match when their
 *  context is the active one, so the highlight + content land on the active
 *  account's row; the Global group always matches. Falls back to the first
 *  visible section if the active one is hidden (e.g. vault deleted while viewing
 *  it). */
const activeComponent = computed(() => {
  for (const g of visibleGroups.value) {
    if (g.contextId !== undefined && g.contextId !== activeContext.value) continue;
    const found = g.items.find((it) => it.id === activeSection.value);
    if (found) return found.component;
  }
  return visibleGroups.value[0]?.items[0]?.component;
});

/** Select a section, switching context first if it lives under a different
 *  account. `ctx === undefined` (a Global section) never switches context. */
async function selectSection(ctx: string | undefined, sectionId: string): Promise<void> {
  if (ctx !== undefined && ctx !== activeContext.value) {
    await switchContext(ctx);
  }
  if (ctx !== undefined) activeContext.value = ctx;
  activeSection.value = sectionId;
  updateUrl();
}

/** Keep `?section` + `?ctx` in sync with the live nav so `openSettingsWindow`'s
 *  "same section + same ctx → just focus" comparison works without a stale-URL
 *  reload. */
function updateUrl(): void {
  if (typeof history === "undefined" || typeof location === "undefined") return;
  const u = new URL(location.href);
  u.searchParams.set("section", activeSection.value);
  u.searchParams.set("ctx", activeContext.value);
  history.replaceState(null, "", u.toString());
}

/** Is a nav item the active one? Account items only when their group's context
 *  is active; Global items always (by section id). */
function isActiveItem(g: SectionGroup, it: SectionItem): boolean {
  if (it.id !== activeSection.value) return false;
  return g.contextId === undefined || g.contextId === activeContext.value;
}

// Deep-link: `openSettings({ section, contextId })` loads the settings window
// with `?section=<id>` + `?ctx=<id>`; seed the active section + context from
// them on mount so a caller lands directly on the requested account/section.
onMounted(() => {
  const params =
    typeof URLSearchParams !== "undefined" ? new URLSearchParams(location.search) : null;
  const requestedSection = params?.get("section") ?? null;
  const requestedCtx = params?.get("ctx") ?? null;
  void (async () => {
    if (requestedCtx && requestedCtx !== activeContext.value) {
      await switchContext(requestedCtx);
    }
    if (requestedSection && knownIds.value.has(requestedSection)) {
      activeSection.value = requestedSection;
    }
    updateUrl();
    await refreshAccounts();
  })();
});
</script>

<template>
  <div class="flex h-screen w-screen flex-col overflow-hidden bg-transparent">
    <div
      class="titlebar-drag flex h-10 shrink-0 items-center gap-2 border-b border-glass-border bg-glass-surface backdrop-blur-2xl"
      :style="{ paddingLeft: titlebar.padding.left + 'px', paddingRight: titlebar.padding.right + 'px' }"
    >
      <div class="px-2 text-xs font-medium text-text">{{ t("settings.title") }}</div>
    </div>

    <div class="flex min-h-0 flex-1">
      <nav class="w-56 shrink-0 overflow-y-auto border-r border-glass-border bg-glass-surface px-2 py-3 backdrop-blur-2xl">
        <div v-for="g in visibleGroups" :key="g.key" class="mb-4">
          <div class="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
            {{ g.groupLabel }}
          </div>
          <button
            v-for="it in g.items"
            :key="g.key + ':' + it.id"
            type="button"
            class="mb-0.5 block w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors"
            :class="
              isActiveItem(g, it) ? 'bg-glass-active text-text' : 'text-text hover:bg-glass-hover'
            "
            @click="selectSection(g.contextId, it.id)"
          >
            {{ t(it.label) }}
          </button>
        </div>
      </nav>

      <main class="min-w-0 flex-1 overflow-y-auto">
        <div class="mx-auto w-full max-w-2xl p-6">
          <component :is="activeComponent" />
        </div>
      </main>
    </div>
  </div>
</template>