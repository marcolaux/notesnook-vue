<script setup lang="ts">
/**
 * Spell check settings section — global enable toggle (Phase 6.6 store) +
 * status line. Language multi-picker is a follow-up; only the global enable
 * + status here.
 */
import { computed, onMounted } from "vue";
import { Surface, Flex, Text } from "@notesnook-vue/ui-vue";
import { useSpellCheckerStore } from "@/stores/spell-checker";

const spellChecker = useSpellCheckerStore();

onMounted(() => {
  // The store is seeded on boot, but make sure the snapshot is current in case
  // the view is reached before the boot refresh landed.
  void spellChecker.refresh();
});

const spellStatus = computed(() => {
  if (spellChecker.lastError) return `Error: ${spellChecker.lastError}`;
  if (!spellChecker.enabled) return "Off";
  const n = spellChecker.enabledLanguages.length;
  return n > 0 ? `On — ${n} language${n === 1 ? "" : "s"}` : "On";
});

async function toggleSpell(e: Event): Promise<void> {
  const checked = (e.target as HTMLInputElement).checked;
  await spellChecker.toggleSpellCheck(checked);
}
</script>

<template>
  <Surface class="rounded-xl border border-border p-5">
    <Flex direction="column" :gap="3">
      <Text as="h2" variant="heading" size="md">Spell check</Text>
      <label class="flex items-center gap-2 text-sm text-text">
        <input
          type="checkbox"
          :checked="spellChecker.enabled"
          class="accent-accent"
          @change="toggleSpell"
        />
        Enable spell checking
      </label>
      <Text variant="body" size="xs" class="text-text-muted">{{ spellStatus }}</Text>
    </Flex>
  </Surface>
</template>