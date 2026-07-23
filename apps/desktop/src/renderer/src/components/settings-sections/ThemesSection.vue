<!--
  Themes settings section — browse/install the upstream Notesnook theme catalog
  (a Vue port of upstream `themes-selector.tsx`) plus "Load from file" import.
  A search input + all/dark/light filter pills + a 2-column infinite grid of
  `ThemeCard`s (seeded with the two installed slots, then catalog pages).
  Card click → `ThemeDetailsDialog` → install; "Set as …" button installs
  directly. File import parses + validates (validateTheme) → details dialog →
  apply (no server round-trip). Cross-window: the install persists to
  localStorage, so the main window's `storage` listener re-applies.

  The composable's refs are destructured to top-level bindings so Vue's template
  ref-unwrap transform applies (a plain composable return object does NOT
  auto-unwrap nested refs in templates, unlike a Pinia store).
-->
<script setup lang="ts">
import { ref } from "vue";
import { Flex, Text } from "@notesnook-vue/ui-vue";
import {
  useThemesCatalog,
  toGridItem,
  type ThemeGridItem
} from "@/composables/use-themes-catalog";
import { useDialogStore } from "@/stores/dialog";
import ThemeCard from "@/components/ThemeCard.vue";
import ThemeDetailsDialog from "@/components/ThemeDetailsDialog.vue";
import type { VueTheme } from "@notesnook-vue/theme-vue";

const {
  items,
  loading,
  loadingMore,
  error,
  searchQuery,
  colorSchemeFilter,
  loadMore,
  install: installFromCatalog,
  validateImport,
  applyImported,
  restoreStockThemes,
  isApplied
} = useThemesCatalog();
const dialog = useDialogStore();

// Details-dialog state. `confirmAction` runs on the confirm button — either a
// catalog install (fetches the full theme) or a direct file-import apply.
const details = ref<ThemeGridItem | null>(null);
const applying = ref(false);
const confirmAction = ref<() => Promise<void> | void>(() => {});

const fileInput = ref<HTMLInputElement | null>(null);

const filters: { id: "all" | "dark" | "light"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "dark", label: "Dark" },
  { id: "light", label: "Light" }
];

function openDetails(item: ThemeGridItem, onConfirm: () => Promise<void> | void): void {
  details.value = item;
  confirmAction.value = onConfirm;
}

async function install(item: ThemeGridItem): Promise<void> {
  if (isApplied(item.id)) {
    details.value = null;
    return;
  }
  applying.value = true;
  const res = await installFromCatalog(item);
  applying.value = false;
  if (res.ok) {
    details.value = null;
  } else {
    void dialog.confirm({ title: "Install failed", message: res.error, confirmLabel: "OK" });
  }
}

function onCardOpen(item: ThemeGridItem): void {
  openDetails(item, () => install(item));
}

function onCardSet(item: ThemeGridItem): void {
  // "Set as … theme" button → install directly (no details dialog), mirroring
  // upstream's button path.
  void install(item);
}

// ── Restore stock themes ──────────────────────────────────────────────────
async function restoreStock(): Promise<void> {
  const confirmed = await dialog.confirm({
    title: "Restore stock themes",
    message:
      "Are you sure you want to restore the stock themes? This will reset your light and dark themes to default.",
    confirmLabel: "Restore",
    danger: true
  });
  if (confirmed) {
    restoreStockThemes();
  }
}

// ── File import ───────────────────────────────────────────────────────────
function pickFile(): void {
  fileInput.value?.click();
}

async function onFileChosen(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = ""; // allow re-picking the same file
  if (!file) return;
  try {
    const text = await file.text();
    const json: unknown = JSON.parse(text);
    const res = validateImport(json);
    if (!res.ok) {
      void dialog.confirm({ title: "Invalid theme", message: res.error, confirmLabel: "OK" });
      return;
    }
    const theme = res.theme as VueTheme;
    openDetails(toGridItem(theme, isApplied(theme.id)), () => {
      applyImported(theme);
      details.value = null;
    });
  } catch {
    void dialog.confirm({
      title: "Invalid theme",
      message: "Could not read the theme file.",
      confirmLabel: "OK"
    });
  }
}

// ── Infinite scroll ──────────────────────────────────────────────────────
function onScroll(e: Event): void {
  const el = e.target as HTMLElement;
  if (el.scrollHeight - el.scrollTop - el.clientHeight < 120) loadMore();
}

function cancelDetails(): void {
  details.value = null;
  applying.value = false;
}
</script>

<template>
  <Flex direction="column" :gap="2">
    <Text variant="body" size="sm" class="text-text-muted">Themes</Text>
    <Text variant="body" size="xs" class="text-text-muted"
      >Browse and install themes from the Notesnook catalog, or load one from a file. Installing a
      theme fills its slot without changing your light/dark/system mode.</Text
    >

    <Flex direction="row" :gap="2" class="flex-wrap items-center">
      <input v-model="searchQuery" type="search" placeholder="Search themes" class="search-input" />
      <div class="filter-pills">
        <button
          v-for="f in filters"
          :key="f.id"
          type="button"
          class="pill"
          :class="{ 'is-active': colorSchemeFilter === f.id }"
          @click="colorSchemeFilter = f.id"
        >
          {{ f.label }}
        </button>
      </div>
      <button type="button" class="import-btn" @click="pickFile">Load from file…</button>
      <button type="button" class="restore-btn" @click="restoreStock">Restore stock themes</button>
      <input
        ref="fileInput"
        type="file"
        accept="application/json,.json"
        class="hidden"
        @change="onFileChosen"
      />
    </Flex>

    <div v-if="error" class="error">{{ error }}</div>

    <div class="grid-scroll" @scroll="onScroll">
      <div v-if="loading && !items.length" class="placeholder">Loading themes…</div>
      <div v-else-if="!items.length" class="placeholder">No themes found.</div>
      <div v-else class="grid">
        <ThemeCard
          v-for="item in items"
          :key="item.id"
          :theme="item"
          @open="onCardOpen(item)"
          @set="onCardSet(item)"
        />
      </div>
      <div v-if="loadingMore" class="placeholder">Loading more…</div>
    </div>
  </Flex>

  <ThemeDetailsDialog
    v-if="details"
    :theme="details"
    :applying="applying"
    @confirm="confirmAction()"
    @cancel="cancelDetails"
  />
</template>

<style scoped>
.search-input {
  flex: 1;
  min-width: 160px;
  padding: 5px 10px;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: var(--color-surface-solid);
  color: var(--color-text);
  font-size: 13px;
  outline: none;
}
.search-input:focus {
  border-color: var(--color-accent);
}
.filter-pills {
  display: inline-flex;
  border: 1px solid var(--color-border);
  border-radius: 9999px;
  padding: 2px;
  gap: 2px;
}
.pill {
  padding: 3px 12px;
  border-radius: 9999px;
  border: none;
  background: transparent;
  color: var(--color-text-muted);
  font-size: 12px;
  cursor: pointer;
}
.pill.is-active {
  background: var(--color-accent);
  color: var(--color-accent-foreground);
}
.import-btn,
.restore-btn {
  padding: 5px 10px;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text);
  font-size: 12px;
  cursor: pointer;
}
.import-btn:hover,
.restore-btn:hover {
  background: var(--color-hover);
}
.error {
  color: var(--color-text);
  font-size: 12px;
  padding: 6px 10px;
  border-radius: 6px;
  background: var(--color-hover);
}
.grid-scroll {
  max-height: 60vh;
  overflow-y: auto;
  margin: 0 -4px;
  padding: 0 4px;
}
.grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.placeholder {
  padding: 16px;
  text-align: center;
  color: var(--color-text-muted);
  font-size: 13px;
}
.hidden {
  display: none;
}
</style>