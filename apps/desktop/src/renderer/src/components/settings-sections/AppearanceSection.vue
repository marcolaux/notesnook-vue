<script setup lang="ts">
/**
 * Appearance settings section — theme mode (light/dark/system). `setThemeMode`
 * bumps `themeChangeSignal`; `App.vue` watches it → `setTheme` (renderer CSS
 * vars) + `desktop.window.setNativeTheme` (OS acrylic/vibrancy material).
 */
import { Surface, Flex, Text } from "@notesnook-vue/ui-vue";
import { useSettingsStore, type ThemeMode } from "@/stores/settings";

const settings = useSettingsStore();

const themeModes: { value: ThemeMode; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" }
];

function pickTheme(mode: ThemeMode): void {
  settings.setThemeMode(mode);
}
</script>

<template>
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
</template>