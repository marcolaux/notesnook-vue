<!--
  Notebook picker overlay — the visual surface for `useNotebookPickerStore.pick()`.
  A single instance is mounted in `App.vue`; the store's `pending` request drives
  it. Theme-consistent with `ConfirmDialog.vue` (glass surface). Closes on Esc /
  backdrop / Cancel → resolves `undefined` (abort); a notebook item → resolves
  its id; "None" → resolves `null`.
-->
<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount, nextTick } from "vue";
import { useI18n } from "vue-i18n";
import { useNotebookPickerStore } from "@/stores/notebook-picker";
import { useCollectionsStore } from "@/stores/collections";

const picker = useNotebookPickerStore();
const collections = useCollectionsStore();
const { t } = useI18n();

const query = ref("");
const listEl = ref<HTMLDivElement | null>(null);
const activeIndex = ref(0);

/** Filtered notebook list (case-insensitive substring on title). */
const items = computed(() => {
  const q = query.value.trim().toLowerCase();
  return collections.sortedNotebooks.filter((n) => q === "" || n.title.toLowerCase().includes(q));
});

/** Rendered rows: a leading "None" entry + the filtered notebooks. The "None"
 *  row is index 0; notebook rows are offset by 1. */
const rows = computed(() => [
  { id: null as string | null, title: t("notebookPicker.none") },
  ...items.value.map((n) => ({ id: n.id, title: n.title }))
]);

function clampActive(): void {
  if (activeIndex.value >= rows.value.length) activeIndex.value = 0;
  if (activeIndex.value < 0) activeIndex.value = Math.max(0, rows.value.length - 1);
}

function selectIndex(i: number): void {
  const row = rows.value[i];
  if (!row) return;
  picker.resolvePick(row.id);
}

function cancel(): void {
  picker.resolvePick(undefined);
}

function onKeydown(e: KeyboardEvent): void {
  if (!picker.open) return;
  if (e.key === "Escape") {
    e.preventDefault();
    picker.resolvePick(undefined);
  } else if (e.key === "Enter") {
    e.preventDefault();
    selectIndex(activeIndex.value);
  } else if (e.key === "ArrowDown") {
    e.preventDefault();
    activeIndex.value = Math.min(rows.value.length - 1, activeIndex.value + 1);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    activeIndex.value = Math.max(0, activeIndex.value - 1);
  }
}

function onDown(e: MouseEvent): void {
  // Outside-click cancels (backdrop catches clicks; the panel stops propagation).
  if (e.target === e.currentTarget) picker.resolvePick(undefined);
}

// Reset search + active row each time the dialog opens; focus the search field.
watch(
  () => picker.open,
  async (isOpen) => {
    if (isOpen) {
      query.value = "";
      activeIndex.value = 0;
      // The picker can open in a window that didn't pre-load collections
      // (e.g. a torn-off pane triggering a default-template "ask" policy).
      // Ensure the notebook list is populated; reactive, so it fills in.
      if (collections.sortedNotebooks.length === 0) void collections.load();
      await nextTick();
      listEl.value?.focus();
    }
  }
);

// Keep the active row in view as the user arrows through the list.
watch(activeIndex, () => {
  const el = listEl.value?.querySelector<HTMLElement>(`[data-idx="${activeIndex.value}"]`);
  el?.scrollIntoView({ block: "nearest" });
});

// A window keydown listener covers Esc/Enter/arrows while the dialog is open.
watch(
  () => picker.open,
  (isOpen) => {
    if (isOpen) window.addEventListener("keydown", onKeydown);
    else window.removeEventListener("keydown", onKeydown);
  }
);

onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKeydown);
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="picker.open && picker.pending"
      class="nb-picker__backdrop"
      @mousedown="onDown"
    >
      <div class="nb-picker__panel" @mousedown.stop>
        <div v-if="picker.pending?.title" class="nb-picker__title">
          {{ picker.pending.title }}
        </div>
        <input
          v-model="query"
          type="text"
          :placeholder="t('notebookPicker.searchPlaceholder')"
          class="nb-picker__search"
          @keydown="onKeydown"
        />
        <div ref="listEl" class="nb-picker__list" tabindex="-1">
          <button
            v-for="(row, i) in rows"
            :key="row.id ?? '__none__'"
            :data-idx="i"
            type="button"
            class="nb-picker__row"
            :class="{ 'is-active': i === activeIndex }"
            @mouseenter="activeIndex = i"
            @click="selectIndex(i)"
          >
            {{ row.title }}
          </button>
          <div v-if="rows.length === 0" class="nb-picker__empty">
            {{ t("notebookPicker.searchPlaceholder") }}
          </div>
        </div>
        <div class="nb-picker__actions">
          <button class="nb-picker__btn nb-picker__btn--cancel" @click="cancel">
            {{ t("notebookPicker.cancel") }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.nb-picker__backdrop {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: center;
  background: var(--color-backdrop, color-mix(in srgb, black 40%, transparent));
  backdrop-filter: blur(2px);
}
.nb-picker__panel {
  width: min(420px, 92vw);
  max-height: min(560px, 88vh);
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
.nb-picker__title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-heading);
  margin-bottom: 8px;
}
.nb-picker__search {
  width: 100%;
  padding: 7px 10px;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
  outline: none;
}
.nb-picker__search:focus-visible {
  border-color: var(--color-accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-accent) 40%, transparent);
}
.nb-picker__list {
  flex: 1;
  overflow-y: auto;
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  outline: none;
}
.nb-picker__row {
  width: 100%;
  text-align: left;
  padding: 7px 10px;
  border-radius: 6px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--color-text);
  font: inherit;
  cursor: pointer;
}
.nb-picker__row:hover,
.nb-picker__row.is-active {
  background: var(--color-hover);
}
.nb-picker__empty {
  padding: 10px;
  color: var(--color-text-muted, var(--color-text));
  opacity: 0.7;
}
.nb-picker__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}
.nb-picker__btn {
  padding: 6px 14px;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text);
  font: inherit;
  cursor: pointer;
}
.nb-picker__btn:hover {
  background: var(--color-hover);
}
</style>