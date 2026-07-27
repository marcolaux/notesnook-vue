<!--
  Confirm dialog overlay — the visual surface for `useDialogStore.confirm()`.
  A single instance is mounted in `App.vue`; the store's `pending` request drives
  the content. Theme-consistent with the rest of the app (glass surface). Closes
  on Esc / outside-click / cancel → resolves `false`; confirm button → `true`.
-->
<script setup lang="ts">
import { watch, onBeforeUnmount } from "vue";
import { useI18n } from "vue-i18n";
import { useDialogStore } from "@/stores/dialog";

const dialog = useDialogStore();
const { t } = useI18n();

function onKeydown(e: KeyboardEvent): void {
  if (!dialog.open) return;
  if (e.key === "Escape") {
    e.preventDefault();
    dialog.resolveConfirm(false);
  } else if (e.key === "Enter") {
    e.preventDefault();
    dialog.resolveConfirm(true);
  }
}

function onDown(e: MouseEvent): void {
  // Outside-click cancels (the overlay backdrop catches clicks; the panel
  // stops propagation so clicks inside don't cancel).
  if (e.target === e.currentTarget) dialog.resolveConfirm(false);
}

function confirm(): void {
  dialog.resolveConfirm(true);
}
function cancel(): void {
  dialog.resolveConfirm(false);
}

// A window keydown listener covers Esc/Enter while the dialog is open (the
// panel is not a focus trap by default; this is simpler + good enough).
watch(
  () => dialog.open,
  (isOpen) => {
    if (isOpen) {
      window.addEventListener("keydown", onKeydown);
    } else {
      window.removeEventListener("keydown", onKeydown);
    }
  }
);

onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKeydown);
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="dialog.open && dialog.pending"
      class="confirm-dialog__backdrop"
      @mousedown="onDown"
    >
      <div class="confirm-dialog__panel" @mousedown.stop>
        <div v-if="dialog.pending?.title" class="confirm-dialog__title">
          {{ dialog.pending.title }}
        </div>
        <div class="confirm-dialog__message">{{ dialog.pending?.message }}</div>
        <div class="confirm-dialog__actions">
          <button class="confirm-dialog__btn confirm-dialog__btn--cancel" @click="cancel">
            {{ dialog.pending?.cancelLabel ?? t("common.cancel") }}
          </button>
          <button
            class="confirm-dialog__btn confirm-dialog__btn--confirm"
            :class="{ 'is-danger': dialog.pending?.danger }"
            @click="confirm"
          >
            {{ dialog.pending?.confirmLabel ?? t("common.confirm") }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.confirm-dialog__backdrop {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: center;
  background: var(--color-backdrop, color-mix(in srgb, black 40%, transparent));
  backdrop-filter: blur(2px);
}
.confirm-dialog__panel {
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
.confirm-dialog__title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-heading);
  margin-bottom: 8px;
}
.confirm-dialog__message {
  color: var(--color-text);
  line-height: 1.45;
}
.confirm-dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}
.confirm-dialog__btn {
  padding: 6px 14px;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text);
  font: inherit;
  cursor: pointer;
}
.confirm-dialog__btn:hover {
  background: var(--color-hover);
}
.confirm-dialog__btn--confirm {
  background: var(--color-accent);
  color: var(--color-accent-foreground);
  border-color: var(--color-accent);
}
.confirm-dialog__btn--confirm.is-danger {
  background: color-mix(in srgb, var(--accent-error) 22%, transparent);
  border-color: color-mix(in srgb, var(--accent-error) 50%, transparent);
  color: var(--paragraph-error, var(--color-text));
}
.confirm-dialog__btn--confirm.is-danger:hover {
  background: color-mix(in srgb, var(--accent-error) 32%, transparent);
}
</style>