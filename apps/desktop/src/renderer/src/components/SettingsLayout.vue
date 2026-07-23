<script setup lang="ts">
/**
 * Settings window layout (Phase 7.0 on-site, restructured to a section-group
 * sidebar nav) — the root rendered by the separate Settings `BrowserWindow`
 * (top-level `/settings` route). A minimal drag titlebar (no sidebar toggle —
 * Settings has its own section nav, not the app sidebar) + a two-pane body:
 * a left nav of section groups (Account / Customization / Security) with the
 * sections under each, and a right content pane showing the active section.
 *
 * Padding reuses `useTitleBarStore` so the drag label clears the OS-drawn
 * window controls (macOS traffic lights / Windows WCO), matching the main
 * window's `TitleBar`. The section nav uses the same glassmorphism tokens
 * (`bg-glass-surface` + `bg-glass-active`/`bg-glass-hover` + `border-glass-border`
 * over `backdrop-blur-2xl`) as the main `Sidebar`, so the acrylic/vibrancy
 * shows through and the active/hover states read identically in both themes.
 *
 * Sections are self-contained components under `components/settings-sections/`.
 * The nav config below is the single place to register a section; later phases
 * add the remaining sections (Profile, Subscription, Auth, Inbox, Behaviour,
 * Editor, Notifications, App lock). The Vault nav item is always shown so a
 * user with no vault can create one (Phase 2 added create-vault + management).
 */
import { ref, computed, onMounted, type Component } from "vue";
import { useTitleBarStore } from "@/stores/titlebar";
import AppearanceSection from "./settings-sections/AppearanceSection.vue";
import LanguageSection from "./settings-sections/LanguageSection.vue";
import NotesSection from "./settings-sections/NotesSection.vue";
import VaultSection from "./settings-sections/VaultSection.vue";
import SyncSection from "./settings-sections/SyncSection.vue";
import BackupSection from "./settings-sections/BackupSection.vue";
import AttachmentsSection from "./settings-sections/AttachmentsSection.vue";
import UpdatesSection from "./settings-sections/UpdatesSection.vue";

const titlebar = useTitleBarStore();

interface SectionItem {
  id: string;
  label: string;
  component: Component;
  /** Optional visibility gate (rarely used now that Vault is always shown). */
  visible?: () => boolean;
}
interface SectionGroup {
  group: string;
  items: SectionItem[];
}

const groups: SectionGroup[] = [
  {
    group: "Customization",
    items: [
      { id: "appearance", label: "Appearance", component: AppearanceSection },
      { id: "language", label: "Language", component: LanguageSection },
      { id: "notes", label: "Notes", component: NotesSection }
    ]
  },
  {
    group: "Security",
    items: [{ id: "vault", label: "Vault", component: VaultSection }]
  },
  {
    group: "Sync & backup",
    items: [
      { id: "sync", label: "Sync", component: SyncSection },
      { id: "backup", label: "Backup & Export", component: BackupSection },
      { id: "attachments", label: "Attachments", component: AttachmentsSection }
    ]
  },
  {
    group: "About",
    items: [{ id: "updates", label: "Updates", component: UpdatesSection }]
  }
];

/** Groups with their gate-hidden items filtered out; empty groups dropped. */
const visibleGroups = computed(() =>
  groups
    .map((g) => ({ ...g, items: g.items.filter((it) => !it.visible || it.visible()) }))
    .filter((g) => g.items.length > 0)
);

/** All known section ids — used to validate a `?section=` deep-link query. */
const knownIds = new Set(groups.flatMap((g) => g.items.map((it) => it.id)));

const activeId = ref("appearance");

// Deep-link: `openSettings({ section })` loads the settings window with
// `?section=<id>`; seed the active section from it on mount so a caller (e.g.
// the title-bar update badge) lands directly on the requested section.
onMounted(() => {
  const requested =
    typeof URLSearchParams !== "undefined"
      ? new URLSearchParams(location.search).get("section")
      : null;
  if (requested && knownIds.has(requested)) activeId.value = requested;
});

/** The component for the active section, falling back to the first visible
 *  section if the active one is hidden (e.g. vault deleted while viewing it). */
const activeComponent = computed(() => {
  for (const g of visibleGroups.value) {
    const found = g.items.find((it) => it.id === activeId.value);
    if (found) return found.component;
  }
  return visibleGroups.value[0]?.items[0]?.component;
});

function selectSection(id: string): void {
  activeId.value = id;
}
</script>

<template>
  <div class="flex h-screen w-screen flex-col overflow-hidden bg-transparent">
    <div
      class="titlebar-drag flex h-10 shrink-0 items-center border-b border-glass-border bg-glass-surface backdrop-blur-2xl"
      :style="{ paddingLeft: titlebar.padding.left + 'px', paddingRight: titlebar.padding.right + 'px' }"
    >
      <div class="px-2 text-xs font-medium text-text">Settings</div>
    </div>

    <div class="flex min-h-0 flex-1">
      <nav class="w-56 shrink-0 overflow-y-auto border-r border-glass-border bg-glass-surface px-2 py-3 backdrop-blur-2xl">
        <div v-for="g in visibleGroups" :key="g.group" class="mb-4">
          <div class="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
            {{ g.group }}
          </div>
          <button
            v-for="it in g.items"
            :key="it.id"
            type="button"
            class="mb-0.5 block w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors"
            :class="
              activeId === it.id ? 'bg-glass-active text-text' : 'text-text hover:bg-glass-hover'
            "
            @click="selectSection(it.id)"
          >
            {{ it.label }}
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