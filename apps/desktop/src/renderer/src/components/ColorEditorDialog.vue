<!--
  Color-editor dialog overlay — the visual surface for
  `useColorDialogStore.openCreate()`, opened by the note-row context menu's
  "New color…" entry. A single instance is mounted in `App.vue`; the store's
  `open`/`title`/`colorCode` state drives the content. Theme-consistent with
  `ConfirmDialog.vue` (glass surface).

  Fields: a title text input + a native `<input type="color">` picker (kept in
  sync with a hex text field) + a row of preset swatches from `DefaultColors`.
  Create → resolves the pending promise with `{title, colorCode}` (empty title
  after trim resolves `null`); Esc / outside-click / Cancel → `null`.
-->
<script setup lang="ts">
import { ref, watch, onBeforeUnmount, nextTick } from "vue";
import { useColorDialogStore } from "@/stores/color-dialog";
import { DefaultColors } from "@notesnook-vue/contracts";

const dialog = useColorDialogStore();

const titleInput = ref<HTMLInputElement | null>(null);

/** Preset swatches from core's `DefaultColors` (name → hex), title-cased. */
const presets = Object.entries(DefaultColors).map(([name, code]) => ({
  title: name.charAt(0).toUpperCase() + name.slice(1),
  colorCode: code
}));

function onKeydown(e: KeyboardEvent): void {
  if (!dialog.open) return;
  if (e.key === "Escape") {
    e.preventDefault();
    dialog.cancel();
  } else if (e.key === "Enter") {
    e.preventDefault();
    dialog.confirm();
  }
}

function onDown(e: MouseEvent): void {
  if (e.target === e.currentTarget) dialog.cancel();
}

function onTitle(e: Event): void {
  dialog.setTitle((e.target as HTMLInputElement).value);
}
function onHex(e: Event): void {
  dialog.setColorCode((e.target as HTMLInputElement).value);
}
function onPicker(e: Event): void {
  dialog.setColorCode((e.target as HTMLInputElement).value);
}

function pickPreset(code: string): void {
  dialog.setColorCode(code);
  // If the title is empty, seed it from the preset name so Create is one click.
  const preset = presets.find((p) => p.colorCode === code);
  if (preset && dialog.title.trim() === "") dialog.setTitle(preset.title);
}

// Focus the title field on open + bind the window keydown listener.
watch(
  () => dialog.open,
  (isOpen) => {
    if (isOpen) {
      window.addEventListener("keydown", onKeydown);
      void nextTick(() => titleInput.value?.focus());
    } else {
      window.removeEventListener("keydown", onKeydown);
    }
  }
);

onBeforeUnmount(() => window.removeEventListener("keydown", onKeydown));
</script>

<template>
  <Teleport to="body">
    <div v-if="dialog.open" class="color-dialog__backdrop" @mousedown="onDown">
      <div class="color-dialog__panel" @mousedown.stop>
        <div class="color-dialog__title">New color</div>

        <label class="color-dialog__field">
          <span class="color-dialog__label">Name</span>
          <input
            ref="titleInput"
            class="color-dialog__input"
            type="text"
            placeholder="Color name"
            :value="dialog.title"
            @input="onTitle"
          />
        </label>

        <div class="color-dialog__field color-dialog__field--row">
          <span class="color-dialog__label">Color</span>
          <input
            class="color-dialog__picker"
            type="color"
            :value="dialog.colorCode"
            @input="onPicker"
          />
          <input
            class="color-dialog__input color-dialog__hex"
            type="text"
            :value="dialog.colorCode"
            @input="onHex"
          />
        </div>

        <div class="color-dialog__presets">
          <button
            v-for="p in presets"
            :key="p.colorCode"
            type="button"
            class="color-dialog__preset"
            :style="{ background: p.colorCode }"
            :title="p.title"
            @click="pickPreset(p.colorCode)"
          />
        </div>

        <div class="color-dialog__actions">
          <button class="color-dialog__btn color-dialog__btn--cancel" @click="dialog.cancel">
            Cancel
          </button>
          <button class="color-dialog__btn color-dialog__btn--confirm" @click="dialog.confirm">
            Create
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.color-dialog__backdrop {
  position: fixed;
  inset: 0;
  z-index: 82;
  display: grid;
  place-items: center;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(2px);
}
.color-dialog__panel {
  width: min(360px, 92vw);
  padding: 18px 18px 14px;
  border-radius: 10px;
  border: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
  background: var(--color-surface-solid, rgba(24, 24, 24, 0.96));
  backdrop-filter: blur(var(--backdrop-blur-base, 24px));
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
  color: var(--color-text, rgba(255, 255, 255, 0.85));
  font-size: 13px;
}
.color-dialog__title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-heading, #fff);
  margin-bottom: 12px;
}
.color-dialog__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 12px;
}
.color-dialog__field--row {
  flex-direction: row;
  align-items: center;
  gap: 8px;
}
.color-dialog__label {
  font-size: 11px;
  color: var(--color-text-muted, rgba(255, 255, 255, 0.5));
}
.color-dialog__input {
  padding: 6px 8px;
  border: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
  border-radius: 6px;
  background: var(--color-surface-solid, rgba(0, 0, 0, 0.3));
  color: inherit;
  font: inherit;
  outline: none;
}
.color-dialog__input:focus {
  border-color: var(--color-accent, rgba(255, 255, 255, 0.35));
}
.color-dialog__picker {
  width: 30px;
  height: 28px;
  padding: 0;
  border: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
  border-radius: 6px;
  background: none;
  cursor: pointer;
}
.color-dialog__hex {
  flex: 1 1 auto;
  text-transform: lowercase;
}
.color-dialog__presets {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 4px 0 14px;
}
.color-dialog__preset {
  width: 22px;
  height: 22px;
  padding: 0;
  border: 1px solid rgba(0, 0, 0, 0.3);
  border-radius: 50%;
  cursor: pointer;
}
.color-dialog__preset:hover {
  transform: scale(1.12);
}
.color-dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.color-dialog__btn {
  padding: 6px 14px;
  border-radius: 6px;
  border: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
  background: transparent;
  color: var(--color-text, rgba(255, 255, 255, 0.85));
  font: inherit;
  cursor: pointer;
}
.color-dialog__btn:hover {
  background: var(--color-hover, rgba(255, 255, 255, 0.08));
}
.color-dialog__btn--confirm {
  background: var(--color-primary, rgba(255, 255, 255, 0.16));
  color: var(--color-heading, #fff);
}
</style>