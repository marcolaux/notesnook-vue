<script setup lang="ts">
/**
 * Language settings section — interface locale (en / pseudo) + spell check.
 * `setLocale` swaps the vue-i18n catalog + persists (full string migration is
 * Phase 7.1). The spell-check controls (Phase 6.6 store) live here too: the
 * global enable toggle + the status line (On — N languages / Off / Error).
 * Language multi-picker for spell check is a follow-up.
 */
import { computed, onMounted } from "vue";
import { Surface, Flex, Text } from "@notesnook-vue/ui-vue";
import { useI18n } from "vue-i18n";
import { setLocale, LOCALES, locale, type Locale } from "@/i18n";
import { useSpellCheckerStore } from "@/stores/spell-checker";

const spellChecker = useSpellCheckerStore();
const { t } = useI18n();

onMounted(() => {
  // The store is seeded on boot, but make sure the snapshot is current in case
  // the view is reached before the boot refresh landed.
  void spellChecker.refresh();
});

const spellStatus = computed(() => {
  if (spellChecker.lastError) return t("settings.language.spellError", { error: spellChecker.lastError });
  if (!spellChecker.enabled) return t("settings.language.spellOff");
  const n = spellChecker.enabledLanguages.length;
  if (n === 1) return t("settings.language.spellOnOne");
  if (n > 1) return t("settings.language.spellOnMany", { n });
  return t("settings.language.spellOn");
});

function pickLocale(e: Event): void {
  const value = (e.target as HTMLSelectElement).value as Locale;
  if (LOCALES.includes(value)) setLocale(value);
}

async function toggleSpell(e: Event): Promise<void> {
  const checked = (e.target as HTMLInputElement).checked;
  await spellChecker.toggleSpellCheck(checked);
}
</script>

<template>
  <Surface class="rounded-xl border border-border p-5">
    <Flex direction="column" :gap="3">
      <Text as="h2" variant="heading" size="md">{{ t("settings.language.title") }}</Text>
      <Flex direction="column" :gap="1">
        <Text variant="body" size="sm" class="text-text-muted">{{ t("settings.language.interface") }}</Text>
        <select
          :value="locale"
          class="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-accent"
          @change="pickLocale"
        >
          <option v-for="l in LOCALES" :key="l" :value="l">
            {{ l === "pseudo" ? t("settings.language.pseudoDev") : t("settings.language.english") }}
          </option>
        </select>
      </Flex>
      <Flex direction="column" :gap="1">
        <Text variant="body" size="sm" class="text-text-muted">{{ t("settings.language.spellCheck") }}</Text>
        <label class="flex items-center gap-2 text-sm text-text">
          <input
            type="checkbox"
            :checked="spellChecker.enabled"
            class="accent-accent"
            @change="toggleSpell"
          />
          {{ t("settings.language.enableSpellCheck") }}
        </label>
        <Text variant="body" size="xs" class="text-text-muted">{{ spellStatus }}</Text>
      </Flex>
    </Flex>
  </Surface>
</template>