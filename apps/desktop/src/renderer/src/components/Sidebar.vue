<script setup lang="ts">
import { useNotesStore } from "@/stores/notes";

const notes = useNotesStore();
</script>

<template>
  <nav class="flex h-full flex-col gap-1 bg-white/5 p-2 text-sm">
    <button class="rounded-md px-2 py-1.5 text-left text-white/80 hover:bg-white/10">
      All Notes
    </button>
    <button class="rounded-md px-2 py-1.5 text-left text-white/80 hover:bg-white/10">
      Notebooks
    </button>
    <button class="rounded-md px-2 py-1.5 text-left text-white/80 hover:bg-white/10">
      Tags
    </button>
    <button class="rounded-md px-2 py-1.5 text-left text-white/80 hover:bg-white/10">
      Monographs
    </button>
    <button class="rounded-md px-2 py-1.5 text-left text-white/80 hover:bg-white/10">
      Archive
    </button>
    <div class="flex-1" />
    <button class="rounded-md px-2 py-1.5 text-left text-white/60 hover:bg-white/10">
      Trash
    </button>
    <button class="rounded-md px-2 py-1.5 text-left text-white/60 hover:bg-white/10">
      Settings
    </button>
    <div class="mt-1 rounded-md bg-white/5 px-2 py-1.5 text-[10px] text-white/50">
      Notes: {{ notes.count }}
    </div>
  </nav>
</template>