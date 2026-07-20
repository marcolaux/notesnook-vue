<script setup lang="ts">
/**
 * Settings view (Phase 7.0 on-site) — the form UI over the headless settings
 * store (+ spell-checker store + i18n). Surfaces the controls that were
 * inert without a UI:
 *
 *  - Appearance: theme mode (light/dark/system). `setThemeMode` bumps
 *    `themeChangeSignal`; `App.vue` watches it → `setTheme` (renderer CSS
 *    vars) + `desktop.window.setNativeTheme` (OS acrylic/vibrancy material).
 *  - Language: locale switch (en / pseudo). `setLocale` swaps the vue-i18n
 *    catalog + persists. Full string migration is Phase 7.1.
 *  - Spell check: enable toggle (Phase 6.6 store). Language multi-picker is a
 *    follow-up; only the global enable + status here.
 *  - Notes: the `db.settings`-backed format fields (date/time/title/day/week
 *    format, trash-cleanup interval). `defaultNotebook`/`profile` need data
 *    (notebook list / profile editor) and are deferred.
 *
 * Uses the `ui-vue` primitives (matching LoginScreen) so the look stays
 * consistent; Tailwind classes here are generated because `style.css` adds
 * `@source` for the renderer tree.
 */
import { computed, onMounted } from "vue";
import { Surface, Flex, Text, Input } from "@notesnook-vue/ui-vue";
import { useSettingsStore, type ThemeMode } from "@/stores/settings";
import { useSpellCheckerStore } from "@/stores/spell-checker";
import { setLocale, LOCALES, locale, type Locale } from "@/i18n";

const settings = useSettingsStore();
const spellChecker = useSpellCheckerStore();

onMounted(() => {
  // The store is seeded on boot, but make sure the spell-checker snapshot is
  // current in case the view is reached before the boot refresh landed.
  void spellChecker.refresh();
});

const themeModes: { value: ThemeMode; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" }
];

const trashOptions: { value: number; label: string }[] = [
  { value: 1, label: "1 day" },
  { value: 7, label: "7 days" },
  { value: 30, label: "30 days" },
  { value: 365, label: "1 year" },
  { value: -1, label: "Never" }
];

const timeOptions: { value: "12-hour" | "24-hour"; label: string }[] = [
  { value: "12-hour", label: "12-hour" },
  { value: "24-hour", label: "24-hour" }
];
const dayOptions: { value: "short" | "long"; label: string }[] = [
  { value: "short", label: "Short" },
  { value: "long", label: "Long" }
];
const weekOptions: { value: "Sun" | "Mon"; label: string }[] = [
  { value: "Sun", label: "Sunday" },
  { value: "Mon", label: "Monday" }
];

const spellStatus = computed(() => {
  if (spellChecker.lastError) return `Error: ${spellChecker.lastError}`;
  if (!spellChecker.enabled) return "Off";
  const n = spellChecker.enabledLanguages.length;
  return n > 0 ? `On — ${n} language${n === 1 ? "" : "s"}` : "On";
});

function pickTheme(mode: ThemeMode): void {
  settings.setThemeMode(mode);
}
function pickLocale(e: Event): void {
  const value = (e.target as HTMLSelectElement).value as Locale;
  if (LOCALES.includes(value)) setLocale(value);
}
async function toggleSpell(e: Event): Promise<void> {
  const checked = (e.target as HTMLInputElement).checked;
  await spellChecker.toggleSpellCheck(checked);
}
function pickTime(e: Event): void {
  settings.setTimeFormat((e.target as HTMLSelectElement).value as "12-hour" | "24-hour");
}
function pickDay(e: Event): void {
  settings.setDayFormat((e.target as HTMLSelectElement).value as "short" | "long");
}
function pickWeek(e: Event): void {
  settings.setWeekFormat((e.target as HTMLSelectElement).value as "Sun" | "Mon");
}
function pickTrash(e: Event): void {
  settings.setTrashCleanupInterval(Number((e.target as HTMLSelectElement).value) as 1 | 7 | 30 | 365 | -1);
}
</script>

<template>
  <div class="min-h-0 flex-1 overflow-y-auto">
    <Flex direction="column" :gap="4" class="mx-auto w-full max-w-2xl p-6">
      <Text as="h1" variant="heading" size="xl">Settings</Text>

      <!-- Appearance -->
      <Surface class="rounded-xl border border-border p-5">
        <Flex direction="column" :gap="3">
          <Text as="h2" variant="heading" size="md">Appearance</Text>
          <Flex direction="column" :gap="1">
            <Text variant="body" size="sm" class="text-text-muted">Theme</Text>
            <div class="flex rounded-md border border-border p-0.5 text-sm">
              <button
                v-for="m in themeModes"
                :key="m.value"
                type="button"
                class="flex-1 rounded px-3 py-1 transition-colors"
                :class="
                  settings.themeMode === m.value
                    ? 'bg-accent text-accent-foreground'
                    : 'text-text-muted hover:bg-hover'
                "
                @click="pickTheme(m.value)"
              >
                {{ m.label }}
              </button>
            </div>
            <Text variant="body" size="xs" class="text-text-muted"
              >System follows your OS light/dark preference.</Text
            >
          </Flex>
        </Flex>
      </Surface>

      <!-- Language -->
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

      <!-- Spell check -->
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

      <!-- Notes -->
      <Surface class="rounded-xl border border-border p-5">
        <Flex direction="column" :gap="4">
          <Text as="h2" variant="heading" size="md">Notes</Text>

          <Flex direction="column" :gap="1">
            <Text variant="body" size="sm" class="text-text-muted">Title format</Text>
            <Input
              :model-value="settings.titleFormat"
              block
              placeholder="Note $date$ $time$"
              @update:model-value="settings.setTitleFormat($event)"
            />
          </Flex>

          <Flex direction="column" :gap="1">
            <Text variant="body" size="sm" class="text-text-muted">Date format</Text>
            <Input
              :model-value="settings.dateFormat"
              block
              placeholder="DD-MM-YYYY"
              @update:model-value="settings.setDateFormat($event)"
            />
          </Flex>

          <div class="grid grid-cols-2 gap-4">
            <Flex direction="column" :gap="1">
              <Text variant="body" size="sm" class="text-text-muted">Time format</Text>
              <select
                :value="settings.timeFormat"
                class="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-accent"
                @change="pickTime"
              >
                <option v-for="o in timeOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
              </select>
            </Flex>
            <Flex direction="column" :gap="1">
              <Text variant="body" size="sm" class="text-text-muted">Day format</Text>
              <select
                :value="settings.dayFormat"
                class="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-accent"
                @change="pickDay"
              >
                <option v-for="o in dayOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
              </select>
            </Flex>
            <Flex direction="column" :gap="1">
              <Text variant="body" size="sm" class="text-text-muted">First day of week</Text>
              <select
                :value="settings.weekFormat"
                class="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-accent"
                @change="pickWeek"
              >
                <option v-for="o in weekOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
              </select>
            </Flex>
            <Flex direction="column" :gap="1">
              <Text variant="body" size="sm" class="text-text-muted">Empty trash after</Text>
              <select
                :value="settings.trashCleanupInterval"
                class="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-accent"
                @change="pickTrash"
              >
                <option v-for="o in trashOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
              </select>
            </Flex>
          </div>
        </Flex>
      </Surface>
    </Flex>
  </div>
</template>