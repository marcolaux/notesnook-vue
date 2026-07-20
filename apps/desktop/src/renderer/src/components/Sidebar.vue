<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { useNotesStore } from "@/stores/notes";
import { useAuthStore } from "@/stores/auth";
import { useCollectionsStore } from "@/stores/collections";
import { topViews, bottomViews } from "@/router/routes";
import { desktop } from "@/platform/desktop-bridge";
import type { CollectionType } from "@/stores/collections";

const notes = useNotesStore();
const auth = useAuthStore();
const collections = useCollectionsStore();
const route = useRoute();
const router = useRouter();
const { t } = useI18n();

/** Plain-link top views (All Notes / Monographs / Archive) — Notebooks &
 * Tags render as expandable collection sections below. */
const linkTopViews = topViews.filter(
  (v) => v.name !== "notebooks" && v.name !== "tags"
);
// Settings opens its own window (singleton) via IPC, so it is NOT a router
// link here — render it as a button below the Trash link.
const linkBottomViews = bottomViews.filter((v) => v.name !== "settings");

/** Open the shared Settings window (focused singleton). Best-effort. */
function openSettings(): void {
  void desktop.window.openSettings.mutate().catch((e) => {
    // eslint-disable-next-line no-console
    console.error("[sidebar] openSettings failed:", e);
  });
}

/** Active-state is driven by the exact current path (no nested routes here). */
function isActive(path: string): boolean {
  return route.path === path;
}

/** Is a given collection item the currently-selected one? */
function isSelected(type: CollectionType, id: string): boolean {
  return collections.selected?.type === type && collections.selected.id === id;
}

/** "All Notes" drops any active collection filter + selection. */
function showAllNotes(): void {
  notes.clearCollectionFilter();
  collections.clearSelection();
}

/** Select a collection, restrict the notes list to it, and show the notes
 * view. */
async function selectCollection(type: CollectionType, id: string): Promise<void> {
  collections.select(type, id);
  await notes.filterByCollection(type, id);
  void router.push("/all");
}
</script>

<template>
  <nav class="flex h-full flex-col gap-1 overflow-y-auto bg-white/5 p-2 text-sm">
    <!-- Plain top links (All Notes / Monographs / Archive) -->
    <RouterLink
      v-for="v in linkTopViews"
      :key="v.name"
      :to="v.path"
      class="titlebar-no-drag rounded-md px-2 py-1.5 text-left transition-colors"
      :class="
        isActive(v.path)
          ? 'bg-white/15 text-white'
          : 'text-white/80 hover:bg-white/10'
      "
      @click="v.name === 'all' ? showAllNotes() : undefined"
    >
      {{ v.label }}
    </RouterLink>

    <!-- Notebooks section (expandable; pinned-first) -->
    <div class="mt-1">
      <button
        class="titlebar-no-drag flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-left text-white/70 hover:bg-white/10"
        @click="collections.toggleSection('notebooks')"
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          class="transition-transform"
          :class="collections.collapsed.notebooks ? '' : 'rotate-90'"
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
        <span>{{ t("sidebar.notebooks") }}</span>
        <span class="ml-auto text-[10px] text-white/40">{{ collections.notebooks.length }}</span>
      </button>
      <div v-if="!collections.collapsed.notebooks" class="mt-0.5 flex flex-col gap-0.5 pl-3">
        <button
          v-for="nb in collections.sortedNotebooks"
          :key="nb.id"
          class="titlebar-no-drag flex items-center gap-1 rounded px-2 py-1 text-left text-[12px] transition-colors"
          :class="
            isSelected('notebook', nb.id)
              ? 'bg-white/15 text-white'
              : 'text-white/75 hover:bg-white/10'
          "
          :title="nb.description || nb.title"
          @click="selectCollection('notebook', nb.id)"
        >
          <span v-if="nb.pinned" class="text-[10px] text-amber-300/80" title="Pinned">📌</span>
          <span class="truncate">{{ nb.title }}</span>
        </button>
        <div
          v-if="collections.notebooks.length === 0"
          class="px-2 py-1 text-[10px] text-white/30"
        >
          {{ t("sidebar.noNotebooks") }}
        </div>
      </div>
    </div>

    <!-- Tags section (expandable; flat — subtags deferred) -->
    <div class="mt-1">
      <button
        class="titlebar-no-drag flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-left text-white/70 hover:bg-white/10"
        @click="collections.toggleSection('tags')"
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          class="transition-transform"
          :class="collections.collapsed.tags ? '' : 'rotate-90'"
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
        <span>{{ t("sidebar.tags") }}</span>
        <span class="ml-auto text-[10px] text-white/40">{{ collections.tags.length }}</span>
      </button>
      <div v-if="!collections.collapsed.tags" class="mt-0.5 flex flex-col gap-0.5 pl-3">
        <button
          v-for="tag in collections.sortedTags"
          :key="tag.id"
          class="titlebar-no-drag flex items-center gap-1 rounded px-2 py-1 text-left text-[12px] transition-colors"
          :class="
            isSelected('tag', tag.id)
              ? 'bg-white/15 text-white'
              : 'text-white/75 hover:bg-white/10'
          "
          @click="selectCollection('tag', tag.id)"
        >
          <span class="text-white/40">#</span>
          <span class="truncate">{{ tag.title }}</span>
        </button>
        <div
          v-if="collections.tags.length === 0"
          class="px-2 py-1 text-[10px] text-white/30"
        >
          {{ t("sidebar.noTags") }}
        </div>
      </div>
    </div>

    <div class="flex-1" />

    <!-- Plain bottom links (Trash) -->
    <RouterLink
      v-for="v in linkBottomViews"
      :key="v.name"
      :to="v.path"
      class="titlebar-no-drag rounded-md px-2 py-1.5 text-left transition-colors"
      :class="
        isActive(v.path)
          ? 'bg-white/15 text-white'
          : 'text-white/60 hover:bg-white/10'
      "
    >
      <span class="flex items-center gap-1">
        {{ v.label }}
        <span v-if="v.name === 'trash' && collections.trashCount > 0" class="text-[10px] text-white/40">
          ({{ collections.trashCount }})
        </span>
      </span>
    </RouterLink>

    <!-- Settings opens its own window (singleton) via IPC, not a route. -->
    <button
      class="titlebar-no-drag rounded-md px-2 py-1.5 text-left text-white/60 transition-colors hover:bg-white/10"
      @click="openSettings"
    >
      Settings
    </button>

    <!-- Account area -->
    <div v-if="auth.isLoggedIn" class="mt-1 rounded-md bg-white/5 px-2 py-1.5">
      <div class="truncate text-[11px] text-white/70">{{ auth.user?.email }}</div>
      <button
        class="mt-1 w-full rounded px-1 py-0.5 text-left text-[10px] text-white/50 hover:bg-white/10"
        @click="auth.logout()"
      >
        Log out
      </button>
    </div>
    <button
      v-else
      class="mt-1 rounded-md px-2 py-1.5 text-left text-[11px] text-white/60 hover:bg-white/10"
      @click="auth.requestSignIn()"
    >
      Sign in
    </button>

    <div class="mt-1 rounded-md bg-white/5 px-2 py-1.5 text-[10px] text-white/50">
      Notes: {{ notes.count }}
    </div>
  </nav>
</template>