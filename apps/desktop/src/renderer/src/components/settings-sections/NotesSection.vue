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
import { useI18n } from "vue-i18n";
import { useSettingsStore } from "@/stores/settings";
import { useCollectionsStore } from "@/stores/collections";
import { useTemplatesStore } from "@/stores/templates";
import { useConfigStore } from "@/stores/config";
import {
  useTemplateNotebooksStore,
  type TemplateNotebookMode
} from "@/stores/template-notebooks";
import {
  blockColorizeDefault,
  setBlockColorizeDefault
} from "@/stores/block-colorize";

const settings = useSettingsStore();
const collections = useCollectionsStore();
const templates = useTemplatesStore();
const config = useConfigStore();
const templateNotebooks = useTemplateNotebooksStore();
const { t } = useI18n();

onMounted(() => {
  // The settings window is its own Pinia app — load the collections so the
  // notebook/tag pickers populate.
  void collections.load();
  // Load templates so the default-note/task-template pickers populate.
  void templates.load();
  // Load the per-template notebook policy map so the per-template rows below
  // reflect the synced settings.
  void templateNotebooks.load();
});

// Option labels are resolved via `t()` inside computeds so they re-evaluate on
// a locale change (the `t` call tracks the reactive `i18n.global.locale`).
const trashOptions = computed<{ value: number; label: string }[]>(() => [
  { value: 1, label: t("settings.notes.trash1Day") },
  { value: 7, label: t("settings.notes.trash7Days") },
  { value: 30, label: t("settings.notes.trash30Days") },
  { value: 365, label: t("settings.notes.trash1Year") },
  { value: -1, label: t("common.never") }
]);

const timeOptions = computed<{ value: "12-hour" | "24-hour"; label: string }[]>(() => [
  { value: "12-hour", label: t("settings.notes.time12") },
  { value: "24-hour", label: t("settings.notes.time24") }
]);
const dayOptions = computed<{ value: "short" | "long"; label: string }[]>(() => [
  { value: "short", label: t("settings.notes.dayShort") },
  { value: "long", label: t("settings.notes.dayLong") }
]);
const weekOptions = computed<{ value: "Sun" | "Mon"; label: string }[]>(() => [
  { value: "Sun", label: t("settings.notes.weekSun") },
  { value: "Mon", label: t("settings.notes.weekMon") }
]);

/** Notebook/tag picker options: a leading "None" (clears the default) followed
 *  by the collections store's sorted lists. `""` represents None at the
 *  `<select>` level and is converted to `undefined` in the change handler. */
const notebookOptions = computed(() => [
  { value: "", label: t("common.none") },
  ...collections.sortedNotebooks.map((n) => ({ value: n.id, label: n.title }))
]);
const tagOptions = computed(() => [
  { value: "", label: t("common.none") },
  ...collections.sortedTags.map((tg) => ({ value: tg.id, label: tg.title }))
]);

/** Template picker options: a leading "None" (clears the default) followed by
 *  the loaded template notes. `""` represents None at the `<select>` level and
 *  is converted to `null` in the change handler. */
const templateOptions = computed(() => [
  { value: "", label: t("common.none") },
  ...templates.templates.map((tp) => ({ value: tp.id, label: tp.title }))
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
function pickDefaultNoteTemplate(e: Event): void {
  const v = (e.target as HTMLSelectElement).value;
  config.setDefaultNoteTemplate(v === "" ? null : v);
}
function pickDefaultTaskTemplate(e: Event): void {
  const v = (e.target as HTMLSelectElement).value;
  config.setDefaultTaskTemplate(v === "" ? null : v);
}

/** Per-template "notebook on creation" mode options. */
const templateModeOptions = computed<{ value: TemplateNotebookMode; label: string }[]>(() => [
  { value: "none", label: t("settings.notes.templateNotebookNone") },
  { value: "ask", label: t("settings.notes.templateNotebookAsk") },
  { value: "fixed", label: t("settings.notes.templateNotebookFixed") }
]);

/** Notebook options for the "fixed" mode — real notebooks only (no leading
 *  "None", since picking None while in fixed mode is handled by switching the
 *  mode back to "none" via the mode select). */
const fixedNotebookOptions = computed(() =>
  collections.sortedNotebooks.map((n) => ({ value: n.id, label: n.title }))
);

function pickTemplateMode(templateId: string, e: Event): void {
  const mode = (e.target as HTMLSelectElement).value as TemplateNotebookMode;
  if (mode === "none") {
    templateNotebooks.clearPolicy(templateId);
    return;
  }
  if (mode === "ask") {
    templateNotebooks.setPolicy(templateId, { mode: "ask", notebookId: null });
    return;
  }
  // fixed: keep an existing fixed notebookId, else default to the first
  // notebook so the mode has an immediate effect (the user can change it).
  const cur = templateNotebooks.getPolicy(templateId);
  let nb = cur.mode === "fixed" ? cur.notebookId : null;
  if (!nb && collections.sortedNotebooks.length > 0) {
    nb = collections.sortedNotebooks[0]?.id ?? null;
  }
  templateNotebooks.setPolicy(templateId, { mode: "fixed", notebookId: nb });
}

function pickTemplateNotebook(templateId: string, e: Event): void {
  const v = (e.target as HTMLSelectElement).value;
  templateNotebooks.setPolicy(templateId, {
    mode: "fixed",
    notebookId: v === "" ? null : v
  });
}
</script>

<template>
  <Surface class="rounded-xl border border-border p-5">
    <Flex direction="column" :gap="4">
      <Text as="h2" variant="heading" size="md">{{ t("settings.notes.title") }}</Text>

      <Flex direction="column" :gap="1">
        <Text variant="body" size="sm" class="text-text-muted">{{ t("settings.notes.titleFormat") }}</Text>
        <Input
          :model-value="settings.titleFormat"
          block
          :placeholder="t('settings.notes.titleFormatPlaceholder')"
          @update:model-value="settings.setTitleFormat($event)"
        />
      </Flex>

      <Flex direction="column" :gap="1">
        <Text variant="body" size="sm" class="text-text-muted">{{ t("settings.notes.dateFormat") }}</Text>
        <Input
          :model-value="settings.dateFormat"
          block
          :placeholder="t('settings.notes.dateFormatPlaceholder')"
          @update:model-value="settings.setDateFormat($event)"
        />
      </Flex>

      <div class="grid grid-cols-2 gap-4">
        <Flex direction="column" :gap="1">
          <Text variant="body" size="sm" class="text-text-muted">{{ t("settings.notes.timeFormat") }}</Text>
          <select
            :value="settings.timeFormat"
            class="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-accent"
            @change="pickTime"
          >
            <option v-for="o in timeOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
          </select>
        </Flex>
        <Flex direction="column" :gap="1">
          <Text variant="body" size="sm" class="text-text-muted">{{ t("settings.notes.dayFormat") }}</Text>
          <select
            :value="settings.dayFormat"
            class="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-accent"
            @change="pickDay"
          >
            <option v-for="o in dayOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
          </select>
        </Flex>
        <Flex direction="column" :gap="1">
          <Text variant="body" size="sm" class="text-text-muted">{{ t("settings.notes.firstDayOfWeek") }}</Text>
          <select
            :value="settings.weekFormat"
            class="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-accent"
            @change="pickWeek"
          >
            <option v-for="o in weekOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
          </select>
        </Flex>
        <Flex direction="column" :gap="1">
          <Text variant="body" size="sm" class="text-text-muted">{{ t("settings.notes.emptyTrashAfter") }}</Text>
          <select
            :value="settings.trashCleanupInterval"
            class="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-accent"
            @change="pickTrash"
          >
            <option v-for="o in trashOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
          </select>
        </Flex>
        <Flex direction="column" :gap="1">
          <Text variant="body" size="sm" class="text-text-muted">{{ t("settings.notes.defaultNotebook") }}</Text>
          <select
            :value="settings.defaultNotebook ?? ''"
            class="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-accent"
            @change="pickDefaultNotebook"
          >
            <option v-for="o in notebookOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
          </select>
        </Flex>
        <Flex direction="column" :gap="1">
          <Text variant="body" size="sm" class="text-text-muted">{{ t("settings.notes.defaultTag") }}</Text>
          <select
            :value="settings.defaultTag ?? ''"
            class="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-accent"
            @change="pickDefaultTag"
          >
            <option v-for="o in tagOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
          </select>
        </Flex>
      </div>

      <Flex direction="column" :gap="2">
        <Text variant="body" size="sm" class="text-text-muted">{{ t("settings.notes.templates") }}</Text>
        <Text v-if="templates.templates.length === 0" variant="body" size="sm" class="text-text-muted">
          {{ t("settings.notes.noTemplates") }}
        </Text>
        <div class="grid grid-cols-2 gap-4">
          <Flex direction="column" :gap="1">
            <Text variant="body" size="sm" class="text-text-muted">{{ t("settings.notes.defaultTemplateNotes") }}</Text>
            <select
              :value="config.defaultNoteTemplate ?? ''"
              class="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-accent"
              @change="pickDefaultNoteTemplate"
            >
              <option v-for="o in templateOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
          </Flex>
          <Flex direction="column" :gap="1">
            <Text variant="body" size="sm" class="text-text-muted">{{ t("settings.notes.defaultTemplateTasks") }}</Text>
            <select
              :value="config.defaultTaskTemplate ?? ''"
              class="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-accent"
              @change="pickDefaultTaskTemplate"
            >
              <option v-for="o in templateOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
          </Flex>
        </div>
      </Flex>

      <Flex direction="column" :gap="2">
        <Text variant="body" size="sm" class="text-text-muted">{{ t("settings.notes.templateNotebook") }}</Text>
        <Text variant="body" size="sm" class="text-text-muted">{{ t("settings.notes.templateNotebookHint") }}</Text>
        <Text v-if="templates.templates.length === 0" variant="body" size="sm" class="text-text-muted">
          {{ t("settings.notes.noTemplates") }}
        </Text>
        <div
          v-for="tp in templates.templates"
          :key="tp.id"
          class="flex flex-wrap items-center gap-3 rounded-md border border-border bg-surface px-3 py-2"
        >
          <Text variant="body" size="sm" class="min-w-[8rem] flex-1">{{ tp.title || t("common.untitled") }}</Text>
          <select
            :value="templateNotebooks.getPolicy(tp.id).mode"
            class="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-accent"
            @change="pickTemplateMode(tp.id, $event)"
          >
            <option v-for="o in templateModeOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
          </select>
          <select
            v-if="templateNotebooks.getPolicy(tp.id).mode === 'fixed'"
            :value="templateNotebooks.getPolicy(tp.id).notebookId ?? ''"
            class="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-accent"
            @change="pickTemplateNotebook(tp.id, $event)"
          >
            <option v-for="o in fixedNotebookOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
          </select>
        </div>
      </Flex>

      <Flex direction="column" :gap="1">
        <Text variant="body" size="sm" class="text-text-muted">{{ t("settings.notes.blockColorize") }}</Text>
        <div class="flex rounded-md border border-border p-0.5 text-sm">
          <button
            v-for="opt in [
              { value: true, labelKey: 'common.on' },
              { value: false, labelKey: 'common.off' }
            ]"
            :key="opt.labelKey"
            type="button"
            class="flex-1 rounded px-3 py-1 transition-colors"
            :class="
              blockColorizeDefault === opt.value
                ? 'bg-accent text-accent-foreground'
                : 'text-text-muted hover:bg-hover'
            "
            @click="setBlockColorizeDefault(opt.value)"
          >
            {{ t(opt.labelKey) }}
          </button>
        </div>
        <Text variant="body" size="xs" class="text-text-muted"
          >{{ t("settings.notes.blockColorizeHint") }}</Text
        >
      </Flex>
    </Flex>
  </Surface>
</template>