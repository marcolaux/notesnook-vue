<script setup lang="ts">
import { useRoute } from "vue-router";
import { useNotesStore } from "@/stores/notes";
import { useAuthStore } from "@/stores/auth";
import { topViews, bottomViews } from "@/router/routes";

const notes = useNotesStore();
const auth = useAuthStore();
const route = useRoute();

/** Active-state is driven by the exact current path (no nested routes here). */
function isActive(path: string): boolean {
  return route.path === path;
}
</script>

<template>
  <nav class="flex h-full flex-col gap-1 bg-white/5 p-2 text-sm">
    <RouterLink
      v-for="v in topViews"
      :key="v.name"
      :to="v.path"
      class="rounded-md px-2 py-1.5 text-left transition-colors"
      :class="
        isActive(v.path)
          ? 'bg-white/15 text-white'
          : 'text-white/80 hover:bg-white/10'
      "
    >
      {{ v.label }}
    </RouterLink>

    <div class="flex-1" />

    <RouterLink
      v-for="v in bottomViews"
      :key="v.name"
      :to="v.path"
      class="rounded-md px-2 py-1.5 text-left transition-colors"
      :class="
        isActive(v.path)
          ? 'bg-white/15 text-white'
          : 'text-white/60 hover:bg-white/10'
      "
    >
      {{ v.label }}
    </RouterLink>

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