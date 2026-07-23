<!--
  Icon-picker dialog overlay — the visual surface for
  `useIconDialogStore.openPicker()`, opened by the notebook context menu's
  "Set icon…" entry. A single instance is mounted in `App.vue`; the store's
  `open`/`selected`/`current` state drives the content. Theme-consistent with
  `ColorEditorDialog.vue` / `ConfirmDialog.vue` (glass surface).

  The grid is the full `ICONS` registry from `@notesnook-vue/ui-vue` — the
  entire Lucide set (~580 icons), so a search field filters by kebab name.
  Click an icon → select + confirm (resolves `{ icon }`); Esc / outside-click /
  Cancel → `null` (no change). The notebook's current icon is ringed so it's
  identifiable. "Remove icon" is a separate context-menu entry (not here) — it
  clears the icon without opening this dialog.
-->
<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount, nextTick } from "vue";
import { useI18n } from "vue-i18n";
import { Icon, allIconNames, loadAllIcons } from "@notesnook-vue/ui-vue";
import { useIconDialogStore } from "@/stores/icon-dialog";

const dialog = useIconDialogStore();
const { t } = useI18n();

/** All available icon names (curated static + lazy full set once loaded),
 *  alphabetised. A ComputedRef — expands from ~48 to ~580 when the lazy chunk
 *  resolves. */
const allNames = allIconNames;

/** True while the full Lucide set chunk is fetching (first picker open). */
const loading = ref(false);

/** Current search query (substring filter on the kebab name). Empty → all. */
const query = ref("");
const searchInput = ref<HTMLInputElement | null>(null);

/** Names matching the current query (case-insensitive substring). */
const names = computed(() => {
  const q = query.value.trim().toLowerCase();
  const list = allNames.value;
  return q ? list.filter((n) => n.includes(q)) : list;
});

/** Pick an icon: select + confirm in one click (resolves `{ icon }`). */
function onPick(name: string): void {
  dialog.select(name);
  dialog.confirm();
}

function onKeydown(e: KeyboardEvent): void {
  if (!dialog.open) return;
  if (e.key === "Escape") {
    e.preventDefault();
    dialog.cancel();
  }
}

function onDown(e: MouseEvent): void {
  if (e.target === e.currentTarget) dialog.cancel();
}

// On open: fetch the full Lucide set (lazy chunk), then focus the search field.
// The grid renders the curated set immediately and expands to the full set when
// the chunk resolves. Bind the window keydown listener while open.
watch(
  () => dialog.open,
  async (isOpen) => {
    if (isOpen) {
      query.value = "";
      window.addEventListener("keydown", onKeydown);
      loading.value = true;
      try {
        await loadAllIcons();
      } finally {
        loading.value = false;
        void nextTick(() => searchInput.value?.focus());
      }
    } else {
      window.removeEventListener("keydown", onKeydown);
    }
  }
);

onBeforeUnmount(() => window.removeEventListener("keydown", onKeydown));
</script>

<template>
  <Teleport to="body">
    <div v-if="dialog.open" class="icon-dialog__backdrop" @mousedown="onDown">
      <div class="icon-dialog__panel" @mousedown.stop>
        <div class="icon-dialog__title">{{ t("sidebar.chooseIcon") }}</div>

        <input
          v-if="!loading"
          ref="searchInput"
          v-model="query"
          class="icon-dialog__search"
          type="text"
          placeholder="Search icons…"
          spellcheck="false"
        />

        <div v-if="loading" class="icon-dialog__empty">Loading icons…</div>
        <template v-else>
          <div v-if="names.length" class="icon-dialog__grid">
            <button
              v-for="name in names"
              :key="name"
              type="button"
              class="icon-dialog__cell"
              :class="{
                'icon-dialog__cell--current': dialog.current === name,
                'icon-dialog__cell--selected': dialog.selected === name
              }"
              :title="name"
              @click="onPick(name)"
            >
              <Icon :name="name" :size="16" />
            </button>
          </div>
          <div v-else class="icon-dialog__empty">No matching icons.</div>
        </template>

        <div class="icon-dialog__actions">
          <button class="icon-dialog__btn" @click="dialog.cancel">Cancel</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.icon-dialog__backdrop {
  position: fixed;
  inset: 0;
  z-index: 82;
  display: grid;
  place-items: center;
  background: var(--color-backdrop, color-mix(in srgb, black 40%, transparent));
  backdrop-filter: blur(2px);
}
.icon-dialog__panel {
  width: min(360px, 92vw);
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  padding: 18px 18px 14px;
  border-radius: 10px;
  border: 1px solid var(--color-border);
  background: var(--color-surface-solid);
  backdrop-filter: blur(var(--backdrop-blur-base, 24px));
  box-shadow: 0 12px 40px color-mix(in srgb, black 50%, transparent);
  color: var(--color-text);
  font-size: 13px;
}
.icon-dialog__title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-heading, #fff);
  margin-bottom: 12px;
}
.icon-dialog__search {
  width: 100%;
  box-sizing: border-box;
  margin-bottom: 10px;
  padding: 6px 8px;
  border: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
  border-radius: 6px;
  background: var(--color-surface-solid, rgba(0, 0, 0, 0.3));
  color: inherit;
  font: inherit;
  outline: none;
}
.icon-dialog__search:focus {
  border-color: var(--color-accent, rgba(255, 255, 255, 0.35));
}
.icon-dialog__empty {
  padding: 16px 0;
  text-align: center;
  color: var(--color-text-muted, rgba(255, 255, 255, 0.5));
  font-size: 12px;
}
.icon-dialog__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(32px, 1fr));
  gap: 4px;
  margin-bottom: 14px;
  overflow-y: auto;
}
.icon-dialog__cell {
  display: grid;
  place-items: center;
  height: 32px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--color-text, rgba(255, 255, 255, 0.85));
  cursor: pointer;
  transition: background 0.12s ease;
}
.icon-dialog__cell:hover {
  background: var(--color-hover, rgba(255, 255, 255, 0.08));
}
.icon-dialog__cell--current {
  border-color: var(--color-accent, rgba(255, 255, 255, 0.35));
}
.icon-dialog__cell--selected {
  background: var(--color-primary, rgba(255, 255, 255, 0.16));
}
.icon-dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.icon-dialog__btn {
  padding: 6px 14px;
  border-radius: 6px;
  border: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
  background: transparent;
  color: var(--color-text, rgba(255, 255, 255, 0.85));
  font: inherit;
  cursor: pointer;
}
.icon-dialog__btn:hover {
  background: var(--color-hover, rgba(255, 255, 255, 0.08));
}
</style>