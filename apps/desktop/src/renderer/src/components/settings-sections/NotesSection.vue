<script setup lang="ts">
/**
 * Notes settings section — the `db.settings`-backed format fields (title /
 * date / time / day / week format, trash-cleanup interval) PLUS the
 * default-notebook / default-tag pickers (data from the collections store —
 * loaded here because the settings window is a separate Pinia app with its
 * own empty store instance). All keys are upstream's existing synced
 * `SettingItemMap` keys, so writes round-trip through sync identically.
 *
 * (Phase 4 will reorganise: title format → Editor; date/time/day/week +
 * trash → Behaviour; default notebook/tag → Behaviour. Kept grouped here
 * until those sections land.)
 */
import { computed, onMounted } from "vue";
import { Surface, Flex, Text, Input } from "@notesnook-vue/ui-vue";
import { useSettingsStore } from "@/stores/settings";
import { useCollectionsStore } from "@/stores/collections";

const settings = useSettingsStore();
const collections = useCollectionsStore();

onMounted(() => {
  // The settings window is its own Pinia app — load the collections so the
  // notebook/tag pickers populate.
  void collections.load();
});

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

/** Notebook/tag picker options: a leading "None" (clears the default) followed
 *  by the collections store's sorted lists. `""` represents None at the
 *  `<select>` level and is converted to `undefined` in the change handler. */
const notebookOptions = computed(() => [
  { value: "", label: "None" },
  ...collections.sortedNotebooks.map((n) => ({ value: n.id, label: n.title }))
]);
const tagOptions = computed(() => [
  { value: "", label: "None" },
  ...collections.sortedTags.map((t) => ({ value: t.id, label: t.title }))
]);

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
function pickDefaultNotebook(e: Event): void {
  const v = (e.target as HTMLSelectElement).value;
  settings.setDefaultNotebook(v === "" ? undefined : v);
}
function pickDefaultTag(e: Event): void {
  const v = (e.target as HTMLSelectElement).value;
  settings.setDefaultTag(v === "" ? undefined : v);
}
</script>

<template>
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
        <Flex direction="column" :gap="1">
          <Text variant="body" size="sm" class="text-text-muted">Default notebook</Text>
          <select
            :value="settings.defaultNotebook ?? ''"
            class="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-accent"
            @change="pickDefaultNotebook"
          >
            <option v-for="o in notebookOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
          </select>
        </Flex>
        <Flex direction="column" :gap="1">
          <Text variant="body" size="sm" class="text-text-muted">Default tag</Text>
          <select
            :value="settings.defaultTag ?? ''"
            class="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-accent"
            @change="pickDefaultTag"
          >
            <option v-for="o in tagOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
          </select>
        </Flex>
      </div>
    </Flex>
  </Surface>
</template>