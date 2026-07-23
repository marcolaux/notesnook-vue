<script setup lang="ts">
/**
 * Appearance settings section — theme mode (light/dark/system) + the
 * transparency (acrylic/glass) toggle + stock theme reset + the themes picker
 * (`ThemesSection`, embedded). `setThemeMode` bumps `themeChangeSignal` and
 * `setTransparencyEnabled` bumps `transparencyChangeSignal`; `App.vue` watches
 * both → `setTheme` (renderer CSS vars) + `desktop.window.setNativeTheme`
 * (OS acrylic/vibrancy material) for theme, and `data-transparency` on <html>
 * for transparency (style.css opts out of the glass look when it's `off`).
 *
 * Installing a theme (via the picker) fills the dark/light slot but does NOT
 * change the light/dark/system mode — the user keeps their active mode.
 *
 * The transparency toggle is hidden on Linux: the OS has no acrylic/vibrancy,
 * so `data-platform="linux"` already forces the opaque root regardless of this
 * setting (there's nothing to enable).
 */
import { Surface, Flex, Text } from "@notesnook-vue/ui-vue";
import { useSettingsStore, type ThemeMode } from "@/stores/settings";
import { useTitleBarStore } from "@/stores/titlebar";
import { useDialogStore } from "@/stores/dialog";
import { useThemesCatalog } from "@/composables/use-themes-catalog";
import ThemesSection from "./ThemesSection.vue";

const settings = useSettingsStore();
const titlebar = useTitleBarStore();
const dialog = useDialogStore();
const { restoreStockThemes } = useThemesCatalog();

const themeModes: { value: ThemeMode; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" }
];

function pickTheme(mode: ThemeMode): void {
  settings.setThemeMode(mode);
}

function pickTransparency(enabled: boolean): void {
  settings.setTransparencyEnabled(enabled);
}

async function restoreStock(): Promise<void> {
  const confirmed = await dialog.confirm({
    title: "Restore stock themes",
    message:
      "Are you sure you want to restore the stock themes? This will reset your light and dark themes to default.",
    confirmLabel: "Restore",
    danger: true
  });
  if (confirmed) {
    restoreStockThemes();
  }
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
      <Flex v-if="!titlebar.isLinux" direction="column" :gap="1">
        <Text variant="body" size="sm" class="text-text-muted">Transparency</Text>
        <div class="flex rounded-md border border-border p-0.5 text-sm">
          <button
            v-for="opt in [
              { value: true, label: 'On' },
              { value: false, label: 'Off' }
            ]"
            :key="opt.label"
            type="button"
            class="flex-1 rounded px-3 py-1 transition-colors"
            :class="
              settings.transparencyEnabled === opt.value
                ? 'bg-accent text-accent-foreground'
                : 'text-text-muted hover:bg-hover'
            "
            @click="pickTransparency(opt.value)"
          >
            {{ opt.label }}
          </button>
        </div>
        <Text variant="body" size="xs" class="text-text-muted"
          >Off disables the translucent acrylic/glass look for a solid
          window.</Text
        >
      </Flex>

      <Flex direction="column" :gap="1">
        <Flex direction="row" class="items-center justify-between gap-4">
          <div>
            <Text variant="body" size="sm" class="font-medium text-text">Stock themes</Text>
            <Text variant="body" size="xs" class="text-text-muted"
              >Reset installed light and dark themes back to default Notesnook themes.</Text
            >
          </div>
          <button
            type="button"
            class="shrink-0 rounded-md border border-border px-3 py-1.5 text-xs text-text hover:bg-hover transition-colors"
            @click="restoreStock"
          >
            Restore stock themes
          </button>
        </Flex>
      </Flex>

      <ThemesSection />
    </Flex>
  </Surface>
</template>