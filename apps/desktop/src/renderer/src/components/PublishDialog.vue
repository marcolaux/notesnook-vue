<!--
  Publish-note dialog overlay — the visual surface for
  `usePublishDialogStore.openCreate(noteId, noteTitle)` / `openEdit(...)`,
  opened by the editor toolbar ⋯ menu, the note context menu, and the
  `app:publish-note` omnibar command. A single instance is mounted in `App.vue`;
  the store's form state drives the content. Theme-consistent with
  `ReminderEditorDialog.vue` / `ConfirmDialog.vue` (glass surface).

  Fields: title (required — the monograph title, prefilled from the note),
  password (optional — encrypts the public page; for a republish the existing
  password is a one-way cipher so the field starts empty with a "leave blank to
  keep" hint), selfDestruct (deletes the monograph after its first view).
  Create/Update → resolves the pending promise with a `PublishInput` (empty
  title after trim resolves `null`); Esc / outside-click / Cancel → `null`.

  Labels are English literals (the codebase is mid-i18n — ReminderEditorDialog
  hardcodes the same way; migrating these is the Phase 7.1 sweep).
-->
<script setup lang="ts">
import { ref, watch, onBeforeUnmount, nextTick } from "vue";
import { usePublishDialogStore } from "@/stores/publish-dialog";

const dialog = usePublishDialogStore();

const titleInput = ref<HTMLInputElement | null>(null);

function onKeydown(e: KeyboardEvent): void {
  if (!dialog.open) return;
  if (e.key === "Escape") {
    e.preventDefault();
    dialog.cancel();
  } else if (e.key === "Enter" && (e.target as HTMLElement)?.tagName !== "TEXTAREA") {
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
function onPassword(e: Event): void {
  dialog.setPassword((e.target as HTMLInputElement).value);
}
function onSelfDestruct(e: Event): void {
  dialog.setSelfDestruct((e.target as HTMLInputElement).checked);
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
    <div v-if="dialog.open" class="pub__backdrop" @mousedown="onDown">
      <div class="pub__panel" @mousedown.stop>
        <div class="pub__title">{{ dialog.mode === "edit" ? "Update published note" : "Publish note" }}</div>
        <div class="pub__hint">
          Publish this note to the web. Anyone with the link can read it
          {{ dialog.selfDestruct ? "once before it self-destructs" : "until you unpublish" }}.
        </div>

        <label class="pub__field">
          <span class="pub__label">Title</span>
          <input
            ref="titleInput"
            class="pub__input"
            type="text"
            placeholder="Note title"
            :value="dialog.title"
            @input="onTitle"
          />
        </label>

        <label class="pub__field">
          <span class="pub__label">Password (optional)</span>
          <div class="pub__pw">
            <input
              class="pub__input"
              :type="dialog.showPassword ? 'text' : 'password'"
              :placeholder="dialog.mode === 'edit' ? 'Leave blank to keep current' : 'Protect the public page'"
              :value="dialog.password"
              @input="onPassword"
            />
            <button
              type="button"
              class="pub__pw-toggle"
              :title="dialog.showPassword ? 'Hide' : 'Show'"
              @click="dialog.setShowPassword(!dialog.showPassword)"
            >{{ dialog.showPassword ? "Hide" : "Show" }}</button>
          </div>
        </label>

        <label class="pub__check">
          <input type="checkbox" :checked="dialog.selfDestruct" @change="onSelfDestruct" />
          <span>Self-destruct after first view</span>
        </label>

        <div class="pub__actions">
          <button class="pub__btn pub__btn--cancel" @click="dialog.cancel">Cancel</button>
          <button class="pub__btn pub__btn--confirm" @click="dialog.confirm">
            {{ dialog.mode === "edit" ? "Update" : "Publish" }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.pub__backdrop {
  position: fixed;
  inset: 0;
  z-index: 82;
  display: grid;
  place-items: center;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(2px);
}
.pub__panel {
  width: min(380px, 92vw);
  max-height: 88vh;
  overflow-y: auto;
  padding: 18px 18px 14px;
  border-radius: 10px;
  border: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
  background: var(--color-surface-solid, rgba(24, 24, 24, 0.96));
  backdrop-filter: blur(var(--backdrop-blur-base, 24px));
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
  color: var(--color-text, rgba(255, 255, 255, 0.85));
  font-size: 13px;
}
.pub__title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-heading, #fff);
  margin-bottom: 6px;
}
.pub__hint {
  font-size: 11px;
  color: var(--color-text-muted, rgba(255, 255, 255, 0.5));
  margin-bottom: 12px;
}
.pub__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 12px;
}
.pub__label {
  font-size: 11px;
  color: var(--color-text-muted, rgba(255, 255, 255, 0.5));
}
.pub__input {
  padding: 6px 8px;
  border: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
  border-radius: 6px;
  background: var(--color-surface-solid, rgba(0, 0, 0, 0.3));
  color: inherit;
  font: inherit;
  outline: none;
}
.pub__input:focus {
  border-color: var(--color-accent, rgba(255, 255, 255, 0.35));
}
.pub__pw {
  display: flex;
  gap: 6px;
  align-items: stretch;
}
.pub__pw .pub__input {
  flex: 1 1 0;
}
.pub__pw-toggle {
  padding: 0 10px;
  border: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
  border-radius: 6px;
  background: transparent;
  color: var(--color-text-muted, rgba(255, 255, 255, 0.5));
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}
.pub__pw-toggle:hover {
  background: var(--color-hover, rgba(255, 255, 255, 0.08));
}
.pub__check {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 12px;
  font-size: 12px;
  color: var(--color-text-muted, rgba(255, 255, 255, 0.6));
}
.pub__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.pub__btn {
  padding: 6px 14px;
  border-radius: 6px;
  border: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
  background: transparent;
  color: var(--color-text, rgba(255, 255, 255, 0.85));
  font: inherit;
  cursor: pointer;
}
.pub__btn:hover {
  background: var(--color-hover, rgba(255, 255, 255, 0.08));
}
.pub__btn--confirm {
  background: var(--color-primary, rgba(255, 255, 255, 0.16));
  color: var(--color-heading, #fff);
}
</style>