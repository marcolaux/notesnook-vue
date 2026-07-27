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
import { useI18n } from "vue-i18n";
import { useSettingsStore, type ThemeMode } from "@/stores/settings";
import { useTitleBarStore } from "@/stores/titlebar";
import { useDialogStore } from "@/stores/dialog";
import { useThemesCatalog } from "@/composables/use-themes-catalog";
import ThemesSection from "./ThemesSection.vue";

const settings = useSettingsStore();
const titlebar = useTitleBarStore();
const dialog = useDialogStore();
const { t } = useI18n();
const { restoreStockThemes } = useThemesCatalog();

const themeModes: { value: ThemeMode; label: string }[] = [
  { value: "light", label: "settings.appearance.light" },
  { value: "dark", label: "settings.appearance.dark" },
  { value: "system", label: "settings.appearance.system" }
];

function pickTheme(mode: ThemeMode): void {
  settings.setThemeMode(mode);
}

function pickTransparency(enabled: boolean): void {
  settings.setTransparencyEnabled(enabled);
}

async function restoreStock(): Promise<void> {
  const confirmed = await dialog.confirm({
    title: t("settings.appearance.restoreStockConfirmTitle"),
    message: t("settings.appearance.restoreStockConfirmMsg"),
    confirmLabel: t("common.restore"),
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
      <Text as="h2" variant="heading" size="md">{{ t("settings.appearance.title") }}</Text>
      <Flex direction="column" :gap="1">
        <Text variant="body" size="sm" class="text-text-muted">{{ t("settings.appearance.theme") }}</Text>
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
            {{ t(m.label) }}
          </button>
        </div>
        <Text variant="body" size="xs" class="text-text-muted"
          >{{ t("settings.appearance.systemHint") }}</Text
        >
      </Flex>
      <Flex v-if="!titlebar.isLinux" direction="column" :gap="1">
        <Text variant="body" size="sm" class="text-text-muted">{{ t("settings.appearance.transparency") }}</Text>
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
              settings.transparencyEnabled === opt.value
                ? 'bg-accent text-accent-foreground'
                : 'text-text-muted hover:bg-hover'
            "
            @click="pickTransparency(opt.value)"
          >
            {{ t(opt.labelKey) }}
          </button>
        </div>
        <Text variant="body" size="xs" class="text-text-muted"
          >{{ t("settings.appearance.transparencyHint") }}</Text
        >
      </Flex>

      <Flex direction="column" :gap="1">
        <Flex direction="row" class="items-center justify-between gap-4">
          <div>
            <Text variant="body" size="sm" class="font-medium text-text">{{ t("settings.appearance.stockThemes") }}</Text>
            <Text variant="body" size="xs" class="text-text-muted"
              >{{ t("settings.appearance.stockThemesDesc") }}</Text
            >
          </div>
          <button
            type="button"
            class="shrink-0 rounded-md border border-border px-3 py-1.5 text-xs text-text hover:bg-hover transition-colors"
            @click="restoreStock"
          >
            {{ t("settings.appearance.restoreStockThemes") }}
          </button>
        </Flex>
      </Flex>

      <ThemesSection />
    </Flex>
  </Surface>
</template>