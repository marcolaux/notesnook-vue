<script setup lang="ts">
/**
 * Onboarding prompt dialog for existing users updating to the Vector Search feature.
 * Prompted only when logged in, for existing users whose semantic search setting has not yet been set.
 * Brand new users are enabled by default and auto-prompted.
 */
import { computed } from "vue";
import { useAuthStore } from "@/stores/auth";
import { useSettingsStore } from "@/stores/settings";
import { Icon } from "@notesnook-vue/ui-vue";

const auth = useAuthStore();
const settings = useSettingsStore();

const show = computed(() => {
  return auth.isLoggedIn && !settings.semanticSearchPrompted;
});

function handleEnable(): void {
  settings.setSemanticSearchEnabled(true);
  settings.setSemanticSearchPrompted(true);
}

function handleDisable(): void {
  settings.setSemanticSearchEnabled(false);
  settings.setSemanticSearchPrompted(true);
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="show"
      class="fixed inset-0 z-50 grid place-items-center bg-black/40 backdrop-blur-sm p-4"
      @mousedown.self="handleDisable"
    >
      <div
        class="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-2xl backdrop-blur-2xl text-text"
        @mousedown.stop
      >
        <div class="flex items-start gap-4">
          <div class="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent/15 text-accent">
            <Icon name="sparkles" :size="22" />
          </div>
          <div class="flex-1">
            <h3 class="text-base font-semibold text-text">Enable Semantic Vector Search?</h3>
            <p class="mt-1 text-xs text-text-muted">100% On-Device & Zero-Knowledge Encrypted</p>
          </div>
        </div>

        <p class="mt-4 text-xs leading-relaxed text-text-muted">
          Notesnook now features <strong>On-Device Semantic Search</strong>! It uses AI vector embeddings to find notes based on context and meaning alongside traditional keyword search.
        </p>
        <p class="mt-2 text-xs leading-relaxed text-text-muted">
          All embeddings are calculated locally on your device and stored directly inside your encrypted database. No plaintext note content or vectors ever leave your machine.
        </p>

        <div class="mt-6 flex justify-end gap-2.5 pt-3 border-t border-border">
          <button
            type="button"
            class="px-3.5 py-1.5 text-xs font-medium rounded-md border border-border bg-transparent hover:bg-surface-hover text-text transition-colors"
            @click="handleDisable"
          >
            Keep Lexical Only
          </button>
          <button
            type="button"
            class="px-3.5 py-1.5 text-xs font-medium rounded-md border border-accent bg-accent text-accent-foreground hover:opacity-90 transition-opacity"
            @click="handleEnable"
          >
            Enable Semantic Search
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
