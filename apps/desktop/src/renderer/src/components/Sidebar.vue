<script setup lang="ts">
import { useNotesStore } from "@/stores/notes";
import { useAuthStore } from "@/stores/auth";

const notes = useNotesStore();
const auth = useAuthStore();
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