<!--
  Link dialog overlay — the visual surface for `useLinkDialogStore.openCreate`
  / `openEdit`, opened by the editor context menu's "Link…" / "Edit link…"
  entries. A single instance is mounted in `App.vue`; the store's
  `open`/`mode`/`href`/`text`/`requireText` state drives the content.
  Theme-consistent with `ColorEditorDialog.vue` / `ConfirmDialog.vue` (glass).

  Fields: a URL text input + (only when `requireText`, i.e. the editor had no
  selection at open time) a link-text input. Insert/Save → resolves the pending
  promise with `{href, text}` (empty href — or empty text when required —
  resolves `null`); Esc / outside-click / Cancel → `null`. Enter triggers
  confirm.
-->
<script setup lang="ts">
import { ref, watch, onBeforeUnmount, nextTick } from "vue";
import { useI18n } from "vue-i18n";
import { useLinkDialogStore } from "@/stores/link-dialog";

const dialog = useLinkDialogStore();
const { t } = useI18n();

const hrefInput = ref<HTMLInputElement | null>(null);

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

function onHref(e: Event): void {
  dialog.setHref((e.target as HTMLInputElement).value);
}
function onText(e: Event): void {
  dialog.setText((e.target as HTMLInputElement).value);
}

// Focus the URL field on open + bind the window keydown listener.
watch(
  () => dialog.open,
  (isOpen) => {
    if (isOpen) {
      window.addEventListener("keydown", onKeydown);
      void nextTick(() => hrefInput.value?.focus());
    } else {
      window.removeEventListener("keydown", onKeydown);
    }
  }
);

onBeforeUnmount(() => window.removeEventListener("keydown", onKeydown));
</script>

<template>
  <Teleport to="body">
    <div v-if="dialog.open" class="link-dialog__backdrop" @mousedown="onDown">
      <div class="link-dialog__panel" @mousedown.stop>
        <div class="link-dialog__title">
          {{ dialog.mode === "edit" ? t("linkDialog.editTitle") : t("linkDialog.createTitle") }}
        </div>

        <label class="link-dialog__field">
          <span class="link-dialog__label">{{ t("linkDialog.url") }}</span>
          <input
            ref="hrefInput"
            class="link-dialog__input"
            type="url"
            inputmode="url"
            autocomplete="off"
            spellcheck="false"
            :placeholder="t('linkDialog.urlPlaceholder')"
            :value="dialog.href"
            @input="onHref"
          />
        </label>

        <label v-if="dialog.requireText" class="link-dialog__field">
          <span class="link-dialog__label">{{ t("linkDialog.text") }}</span>
          <input
            class="link-dialog__input"
            type="text"
            autocomplete="off"
            :placeholder="t('linkDialog.textPlaceholder')"
            :value="dialog.text"
            @input="onText"
          />
        </label>

        <div class="link-dialog__actions">
          <button class="link-dialog__btn link-dialog__btn--cancel" @click="dialog.cancel">
            {{ t("common.cancel") }}
          </button>
          <button class="link-dialog__btn link-dialog__btn--confirm" @click="dialog.confirm">
            {{ dialog.mode === "edit" ? t("linkDialog.save") : t("linkDialog.insert") }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.link-dialog__backdrop {
  position: fixed;
  inset: 0;
  z-index: 82;
  display: grid;
  place-items: center;
  background: var(--color-backdrop, color-mix(in srgb, black 40%, transparent));
  backdrop-filter: blur(2px);
}
.link-dialog__panel {
  width: min(380px, 92vw);
  padding: 18px 18px 14px;
  border-radius: 10px;
  border: 1px solid var(--color-border);
  background: var(--color-surface-solid);
  backdrop-filter: blur(var(--backdrop-blur-base, 24px));
  box-shadow: 0 12px 40px color-mix(in srgb, black 50%, transparent);
  color: var(--color-text);
  font-size: 13px;
}
.link-dialog__title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-heading, #fff);
  margin-bottom: 12px;
}
.link-dialog__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 12px;
}
.link-dialog__label {
  font-size: 11px;
  color: var(--color-text-muted, rgba(255, 255, 255, 0.5));
}
.link-dialog__input {
  padding: 6px 8px;
  border: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
  border-radius: 6px;
  background: var(--color-surface-solid, rgba(0, 0, 0, 0.3));
  color: inherit;
  font: inherit;
  outline: none;
}
.link-dialog__input:focus {
  border-color: var(--color-accent, rgba(255, 255, 255, 0.35));
}
.link-dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.link-dialog__btn {
  padding: 6px 14px;
  border-radius: 6px;
  border: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
  background: transparent;
  color: var(--color-text, rgba(255, 255, 255, 0.85));
  font: inherit;
  cursor: pointer;
}
.link-dialog__btn:hover {
  background: var(--color-hover, rgba(255, 255, 255, 0.08));
}
.link-dialog__btn--confirm {
  background: var(--color-primary, rgba(255, 255, 255, 0.16));
  color: var(--color-heading, #fff);
}
</style>