<script setup lang="ts">
import { ref } from "vue";
import Sidebar from "@/components/Sidebar.vue";
import NotesList from "@/components/NotesList.vue";
import Editor from "@/components/Editor.vue";
import TitleBar from "@/components/TitleBar.vue";

const sidebarCollapsed = ref(false);
const listCollapsed = ref(false);
</script>

<template>
  <div class="flex h-screen w-screen flex-col overflow-hidden bg-transparent">
    <TitleBar
      :sidebar-collapsed="sidebarCollapsed"
      @toggle-sidebar="sidebarCollapsed = !sidebarCollapsed"
    />
    <div class="flex min-h-0 flex-1">
      <Sidebar
        v-show="!sidebarCollapsed"
        class="w-60 shrink-0 border-r border-white/10 backdrop-blur-2xl"
      />
      <NotesList
        v-show="!listCollapsed"
        :sidebar-collapsed="sidebarCollapsed"
        class="w-80 shrink-0 border-r border-white/10 backdrop-blur-xl"
        @toggle-sidebar="sidebarCollapsed = !sidebarCollapsed"
      />
      <Editor class="min-w-0 flex-1 backdrop-blur-2xl" />
    </div>
  </div>
</template>