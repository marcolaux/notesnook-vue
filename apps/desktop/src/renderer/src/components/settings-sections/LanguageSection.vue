<script setup lang="ts">
/**
 * Language settings section — two independent concerns, clearly separated:
 *
 *  - **Interface language** (the *application* language): the vue-i18n locale
 *    (`en` / `de` / `pseudo`) via `setLocale`. This is the UI language only.
 *  - **Spell check**: the global Electron `session` spell-checker enable toggle
 *    + the **spell-check language multi-picker** (Windows/Linux only). Spell
 *    checking supports several languages at once and is **independent of the
 *    interface locale** — a user can run the app in English while spell-checking
 *    German + French.
 *
 * Platform note: on macOS, Electron's `session.setSpellCheckerLanguages` is a
 * **no-op** (Electron 21+) — the native OS spellchecker detects the language
 * automatically from the macOS keyboard/system languages, so manual language
 * selection isn't possible (or needed). The enable toggle still works on
 * macOS; only the language picker is hidden there with an explanatory note.
 *
 * The spell-check controls (Phase 6.6 store) round-trip over the tRPC bridge;
 * `toggleLanguage(code)` adds/removes a code in the enabled set and the main
 * impl resolves it against the platform's available languages.
 */
import { computed, onMounted } from "vue";
import { Surface, Flex, Text } from "@notesnook-vue/ui-vue";
import { useI18n } from "vue-i18n";
import { setLocale, LOCALES, locale, type Locale } from "@/i18n";
import { useSpellCheckerStore } from "@/stores/spell-checker";
import { useTitleBarStore } from "@/stores/titlebar";

const spellChecker = useSpellCheckerStore();
const titlebar = useTitleBarStore();
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

/** Toggle a spell-check language on/off. The whole list is disabled while a
 *  request is in flight or when spell checking is off. */
async function toggleLang(code: string): Promise<void> {
  await spellChecker.toggleLanguage(code);
}

function localeLabel(l: string): string {
  return l === "pseudo"
    ? t("settings.language.pseudoDev")
    : l === "de"
      ? t("settings.language.german")
      : t("settings.language.english");
}
</script>

<template>
  <Surface class="rounded-xl border border-border p-5">
    <Flex direction="column" :gap="6">
      <Text as="h2" variant="heading" size="md">{{ t("settings.language.title") }}</Text>

      <!-- Interface (application) language -->
      <Flex direction="column" :gap="1">
        <Text variant="body" size="sm" class="text-text-muted">{{ t("settings.language.interface") }}</Text>
        <select
          :value="locale"
          class="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-accent"
          @change="pickLocale"
        >
          <option v-for="l in LOCALES" :key="l" :value="l">{{ localeLabel(l) }}</option>
        </select>
      </Flex>

      <!-- Spell check (independent of the interface language) -->
      <Flex direction="column" :gap="2">
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

        <!-- Spell-check language multi-picker (Windows/Linux only). On macOS
             setSpellCheckerLanguages is a no-op — the OS spellchecker detects
             language automatically — so the picker is replaced with a note. -->
        <Flex v-if="!titlebar.isMacos" direction="column" :gap="1" class="mt-1">
          <Text variant="body" size="sm">{{ t("settings.language.spellLanguages") }}</Text>
          <Text variant="body" size="xs" class="text-text-muted">{{ t("settings.language.spellLanguagesHint") }}</Text>
          <div
            class="max-h-48 overflow-y-auto rounded-md border border-border bg-surface p-1"
            :class="{ 'pointer-events-none opacity-50': !spellChecker.enabled || spellChecker.busy }"
          >
            <label
              v-for="lang in spellChecker.availableLanguages"
              :key="lang.code"
              class="flex items-center gap-2 rounded px-2 py-1 text-sm text-text hover:bg-glass-hover"
            >
              <input
                type="checkbox"
                :checked="spellChecker.enabledCodes.includes(lang.code)"
                class="accent-accent"
                :disabled="!spellChecker.enabled || spellChecker.busy"
                @change="toggleLang(lang.code)"
              />
              {{ lang.name }}
            </label>
            <Text
              v-if="spellChecker.availableLanguages.length === 0"
              variant="body"
              size="xs"
              class="px-2 py-1 text-text-muted"
            >
              {{ t("settings.language.noLanguages") }}
            </Text>
          </div>
        </Flex>
        <Text v-else variant="body" size="xs" class="text-text-muted">
          {{ t("settings.language.spellMacosAuto") }}
        </Text>
      </Flex>
    </Flex>
  </Surface>
</template>