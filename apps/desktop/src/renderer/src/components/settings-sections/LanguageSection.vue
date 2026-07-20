<script setup lang="ts">
/**
 * Language settings section — interface locale (en / pseudo). `setLocale`
 * swaps the vue-i18n catalog + persists. Full string migration is Phase 7.1.
 */
import { Surface, Flex, Text } from "@notesnook-vue/ui-vue";
import { setLocale, LOCALES, locale, type Locale } from "@/i18n";

function pickLocale(e: Event): void {
  const value = (e.target as HTMLSelectElement).value as Locale;
  if (LOCALES.includes(value)) setLocale(value);
}
</script>

<template>
  <Surface class="rounded-xl border border-border p-5">
    <Flex direction="column" :gap="3">
      <Text as="h2" variant="heading" size="md">Language</Text>
      <Flex direction="column" :gap="1">
        <Text variant="body" size="sm" class="text-text-muted">Interface language</Text>
        <select
          :value="locale"
          class="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-accent"
          @change="pickLocale"
        >
          <option v-for="l in LOCALES" :key="l" :value="l">
            {{ l === "pseudo" ? "Pseudo (dev)" : "English" }}
          </option>
        </select>
      </Flex>
    </Flex>
  </Surface>
</template>