<script setup lang="ts">
/**
 * A reference card — the rich, clickable representation of a *related* note
 * used by the editor footer's References section (`EditorReferences.vue`):
 * backlinks (notes linking to the open note) and a daily note's created /
 * modified notes. Unlike the old title-only chips, a card shows the note's
 * title, its tags as pills, and a short excerpt (the `headline`), plus a subtle
 * color tint when the note has an assigned color.
 *
 * Click opens the note (the parent opens it in THIS pane's group); right-click
 * shows the same note context menu the notes list shows (acts on the referenced
 * note). Presentational only — all data + actions come via props/emits so the
 * card stays simple and the section owns the store wiring.
 */
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { Icon } from "@notesnook-vue/ui-vue";
import { useNoteContextMenu } from "@/composables/use-note-context-menu";
import type { NoteListItem } from "@/stores/notes";

const props = defineProps<{ note: NoteListItem }>();
const emit = defineEmits<{ open: [noteId: string] }>();

const { t } = useI18n();
const { showNoteMenu } = useNoteContextMenu();

const hasTint = computed(() => !!props.note.color);
const tintStyle = computed(() =>
  props.note.color ? { "--note-tint": props.note.color.colorCode } : undefined
);

function onClick(): void {
  emit("open", props.note.id);
}

function onContext(e: MouseEvent): void {
  void showNoteMenu(
    {
      id: props.note.id,
      title: props.note.title,
      pinned: props.note.pinned,
      favorite: props.note.favorite
    },
    e
  );
}
</script>

<template>
  <button
    type="button"
    class="reference-card group relative flex w-full flex-col gap-1.5 rounded-xl border border-glass-border bg-glass-surface px-3 py-2 text-left transition-colors hover:bg-glass-hover"
    :class="{ 'has-tint': hasTint }"
    :style="tintStyle"
    :title="t('editor.openTitle', { title: note.title })"
    @click="onClick"
    @contextmenu.prevent="onContext"
  >
    <span class="flex items-center gap-1.5 text-sm font-medium text-text">
      <Icon
        v-if="note.pinned"
        name="pin"
        :size="12"
        class="shrink-0 text-text-muted"
      />
      <Icon
        v-if="note.favorite"
        name="star"
        :size="12"
        class="shrink-0 text-amber-400"
      />
      <span class="truncate">{{ note.title }}</span>
    </span>
    <span
      v-if="note.tags.length > 0"
      class="flex flex-wrap items-center gap-1"
    >
      <span
        v-for="tag in note.tags"
        :key="tag"
        class="rounded-full bg-glass-active px-1.5 py-0.5 text-[10px] text-text-muted"
      >#{{ tag }}</span>
    </span>
    <span
      v-if="note.headline"
      class="line-clamp-2 text-xs text-text-muted"
    >{{ note.headline }}</span>
  </button>
</template>

<style scoped>
/* Mirror the notes-list tint: a subtle color-mix overlay from `--note-tint`
   so a referenced note with an assigned color is recognisable at a glance. */
.reference-card.has-tint {
  background-color: color-mix(in srgb, var(--note-tint) 14%, transparent);
  border-color: color-mix(in srgb, var(--note-tint) 40%, var(--glass-border, transparent));
}
.reference-card.has-tint:hover {
  background-color: color-mix(in srgb, var(--note-tint) 22%, transparent);
}
</style>