<!--
  Context-menu overlay (right-click menus on the notes list + sidebar). The
  headless state lives in `stores/context-menu` (open/x/y/items/activeIndex +
  move/execute, and v2 submenu state); this component is purely the visual
  surface — a list of actions + separators teleported to <body> at the cursor
  coords, glass-styled to match the sidebar/list. Built where the right-click
  happens via the entry builders in `utils/context-menu-entries.ts`; the store
  owns no domain logic.

  v2 submenus: an item with a `submenu` renders a `▸` chevron and opens a second
  panel to the right of its row on hover / ArrowRight. The submenu may carry a
  search `<input>` (Tags / Notebooks pickers) which filters `build(query)` live,
  and items may render a colour-swatch dot (Color submenu). At most one submenu
  is open at a time; ArrowLeft closes it.

  State is owned by the store; this binds to it:
    ↑/↓     → move(-1) / move(1)            (deepest open level)
    →       → openSubmenu(activeIndex)       (root submenu-parent row)
    ←       → closeSubmenu()
    Enter   → execute                        (deepest active leaf)
    Esc     → close
    hover   → hoverRoot / hoverSubmenu
    click   → execute (leaf) / openSubmenu (root submenu-parent)
  Outside mousedown, window scroll/resize, and blur all close the menu. The
  root position is clamped into the viewport after render (the menu knows its
  own size; the store only carries the raw cursor coords). The submenu is
  anchored to the active root row's right edge (flips left on overflow).
-->
<script setup lang="ts">
import { ref, watch, onBeforeUnmount, nextTick } from "vue";
import { Icon } from "@notesnook-vue/ui-vue";
import { useContextMenuStore } from "@/stores/context-menu";
import { clampMenuPosition } from "@/utils/context-menu";

const menu = useContextMenuStore();

const root = ref<HTMLElement | null>(null);
const submenuEl = ref<HTMLElement | null>(null);
const searchInput = ref<HTMLInputElement | null>(null);
/** Clamped top/left in px (set after the overlay measures itself). */
const top = ref(0);
const left = ref(0);
/** Submenu clamped top/left (anchored to the active root row). */
const subTop = ref(0);
const subLeft = ref(0);

function onKeydown(e: KeyboardEvent): void {
  // If focus is inside the search input, let normal text editing through; only
  // ArrowDown (into the list), Enter (run active), and Escape close the menu.
  const inSearch = e.target === searchInput.value;
  switch (e.key) {
    case "ArrowDown":
      e.preventDefault();
      menu.move(1);
      break;
    case "ArrowUp":
      e.preventDefault();
      menu.move(-1);
      break;
    case "ArrowRight":
      if (menu.submenu) break; // already in a submenu — no-op
      if (menu.items[menu.activeIndex]?.submenu) {
        e.preventDefault();
        menu.openSubmenu(menu.activeIndex);
      }
      break;
    case "ArrowLeft":
      if (menu.submenu) {
        e.preventDefault();
        menu.closeSubmenu();
      }
      break;
    case "Enter":
      e.preventDefault();
      void menu.execute();
      break;
    case "Escape":
      e.preventDefault();
      if (menu.submenu) menu.closeSubmenu();
      else menu.close();
      break;
    default:
      if (inSearch) return; // allow typing in the search field
      break;
  }
}

function run(i: number): void {
  menu.setActiveIndex(i);
  void menu.execute();
}

/** Submenu item click: set the submenu's active row then run it (the store's
 *  `execute` reads the submenu's active row when a submenu is open). */
function runSub(i: number): void {
  menu.hoverSubmenu(i);
  void menu.execute();
}

/** Clamp the root menu into the viewport using its measured size + the stored
 *  cursor coords. Called after every open (and on root items change while open). */
function reposition(): void {
  const el = root.value;
  if (!el) return;
  const r = el.getBoundingClientRect();
  const pos = clampMenuPosition(menu.x, menu.y, r.width, r.height, {
    width: window.innerWidth,
    height: window.innerHeight
  });
  top.value = pos.top;
  left.value = pos.left;
}

/** Position the submenu panel at the right edge of the active root row (flips
 *  left on viewport overflow). Called after the submenu opens / its items change. */
function repositionSubmenu(): void {
  const panel = submenuEl.value;
  if (!panel || !root.value) return;
  const row = root.value.querySelector<HTMLElement>(".context-menu__item.is-active");
  const rowRect = row ? row.getBoundingClientRect() : { top: top.value, bottom: top.value + 24, right: left.value + 180, left: left.value };
  const pr = panel.getBoundingClientRect();
  const vp = { width: window.innerWidth, height: window.innerHeight };
  const wantLeft = rowRect.right;
  const flippedLeft = wantLeft + pr.width + 8 > vp.width;
  const leftPos = flippedLeft ? Math.max(8, rowRect.left - pr.width) : wantLeft;
  const topPos = rowRect.top + pr.height + 8 > vp.height ? Math.max(8, vp.height - pr.height - 8) : rowRect.top;
  subTop.value = topPos;
  subLeft.value = leftPos;
}

function onDown(e: MouseEvent): void {
  const t = e.target as Node | null;
  if (root.value && root.value.contains(t)) return;
  if (submenuEl.value && submenuEl.value.contains(t)) return;
  menu.close();
}

function onClose(): void {
  menu.close();
}

/** A scroll anywhere dismisses the menu — EXCEPT a scroll originating inside
 *  the menu/submenu itself. The submenu list scrolls when long (Notebooks /
 *  Tags picker); mouse-wheel and scrollbar-drag over it must NOT close the
 *  menu. Scroll events do not bubble, but a capture listener on window still
 *  receives them (capture phase descends to the target), so we inspect
 *  `event.target` to tell an inner-list scroll apart from a viewport scroll. */
function onScroll(e: Event): void {
  const t = e.target as Node | null;
  if (t && root.value && root.value.contains(t)) return;
  if (t && submenuEl.value && submenuEl.value.contains(t)) return;
  menu.close();
}

// Focus the menu root on open so keyboard nav works, then clamp into the
// viewport (the overlay must exist before we can measure it). Re-clamp when the
// root entry list changes (a toggle flips `checked` → same size, but a menu
// whose entries change size would otherwise drift off-cursor).
watch(
  () => menu.open,
  async (isOpen) => {
    if (isOpen) {
      // Seed at the raw cursor coords first so the first paint is near the
      // cursor (no flash at 0,0), then clamp once measured.
      top.value = menu.y;
      left.value = menu.x;
      await nextTick();
      root.value?.focus();
      reposition();
      document.addEventListener("mousedown", onDown, true);
      window.addEventListener("scroll", onScroll, true);
      window.addEventListener("resize", onClose);
      window.addEventListener("blur", onClose);
    } else {
      document.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("blur", onClose);
    }
  },
  { immediate: true, flush: "post" }
);

// Re-clamp the root if its entries change while open.
watch(
  () => menu.items.length,
  () => {
    if (menu.open) reposition();
  },
  { flush: "post" }
);

// When a submenu opens, focus its search input (if any) so typing filters; then
// anchor the panel to the active root row. Re-anchor when the submenu items
// change (query filter / keepOpen rebuild can resize the panel).
watch(
  () => menu.submenu,
  async (sub) => {
    if (!sub) return;
    await nextTick();
    if (sub.spec.search) searchInput.value?.focus();
    else root.value?.focus();
    repositionSubmenu();
  },
  { flush: "post" }
);

watch(
  () => menu.submenu?.items.length,
  () => {
    if (menu.submenu) repositionSubmenu();
  },
  { flush: "post" }
);

// Keep the active row visible within the scrollable list (root + submenu).
watch(
  () => [menu.activeIndex, menu.submenu?.activeIndex] as const,
  () => {
    const scope = menu.submenu ? submenuEl.value : root.value;
    scope?.querySelector(".context-menu__item.is-active")?.scrollIntoView({ block: "nearest" });
  },
  { flush: "post" }
);

onBeforeUnmount(() => {
  if (menu.open) menu.close();
  document.removeEventListener("mousedown", onDown, true);
  window.removeEventListener("scroll", onScroll, true);
  window.removeEventListener("resize", onClose);
  window.removeEventListener("blur", onClose);
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="menu.open"
      ref="root"
      class="context-menu titlebar-no-drag"
      tabindex="-1"
      :style="{ top: top + 'px', left: left + 'px' }"
      @keydown="onKeydown"
      @mousedown.prevent
    >
      <template v-for="(item, i) in menu.items" :key="item.id">
        <div v-if="item.separator" class="context-menu__sep" />
        <button
          v-else
          type="button"
          class="context-menu__item"
          :class="{
            'is-active': i === menu.activeIndex,
            'is-danger': item.danger,
            'is-disabled': item.disabled,
            'has-submenu': !!item.submenu
          }"
          :disabled="item.disabled"
          @mouseenter="!item.disabled && menu.hoverRoot(i)"
          @click="!item.disabled && (item.submenu ? menu.openSubmenu(i) : run(i))"
        >
          <span class="context-menu__check" :class="{ 'is-on': item.checked }">
            <Icon v-if="item.icon" :name="item.icon" :size="12" class="context-menu__icon" />
            <span v-else-if="item.color" class="context-menu__swatch" :style="{ background: item.color }" />
            <Icon v-else-if="item.checked" name="check" :size="12" />
          </span>
          <span class="context-menu__label">{{ item.label }}</span>
          <Icon v-if="item.submenu" name="chevron-right" :size="12" class="context-menu__chevron" />
        </button>
      </template>
    </div>

    <!-- v2 submenu panel (one level deep). Anchored to the active root row. -->
    <div
      v-if="menu.open && menu.submenu"
      ref="submenuEl"
      class="context-menu context-menu__submenu titlebar-no-drag"
      tabindex="-1"
      :style="{ top: subTop + 'px', left: subLeft + 'px' }"
      @keydown="onKeydown"
    >
      <input
        v-if="menu.submenu.spec.search"
        ref="searchInput"
        class="context-menu__search"
        type="text"
        :placeholder="menu.submenu.spec.search.placeholder"
        :value="menu.submenu.query"
        @input="menu.setQuery(($event.target as HTMLInputElement).value)"
      />
      <template v-for="(item, i) in menu.submenu.items" :key="item.id">
        <div v-if="item.separator" class="context-menu__sep" />
        <button
          v-else
          type="button"
          class="context-menu__item"
          :class="{
            'is-active': i === menu.submenu!.activeIndex,
            'is-danger': item.danger,
            'is-disabled': item.disabled
          }"
          :disabled="item.disabled"
          @mouseenter="!item.disabled && menu.hoverSubmenu(i)"
          @click="!item.disabled && runSub(i)"
        >
          <span class="context-menu__check" :class="{ 'is-on': item.checked }">
            <Icon v-if="item.icon" :name="item.icon" :size="12" class="context-menu__icon" />
            <span v-else-if="item.color" class="context-menu__swatch" :style="{ background: item.color }" />
            <Icon v-else-if="item.checked" name="check" :size="12" />
          </span>
          <span class="context-menu__label">{{ item.label }}</span>
        </button>
      </template>
    </div>
  </Teleport>
</template>

<style scoped>
.context-menu {
  position: fixed;
  z-index: 70;
  min-width: 180px;
  max-width: 260px;
  padding: 4px;
  display: flex;
  flex-direction: column;
  gap: 1px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: var(--color-surface-solid);
  backdrop-filter: blur(var(--backdrop-blur-base, 24px));
  box-shadow: 0 12px 40px color-mix(in srgb, black 50%, transparent);
  font-size: 12px;
  color: var(--color-text, rgba(255, 255, 255, 0.85));
  outline: none;
}

.context-menu__submenu {
  z-index: 71;
  min-width: 200px;
  max-height: 320px;
  overflow-y: auto;
}

.context-menu__sep {
  height: 1px;
  margin: 4px 2px;
  background: var(--color-border, rgba(255, 255, 255, 0.1));
}

.context-menu__search {
  margin: 2px 2px 4px;
  padding: 5px 8px;
  border: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
  border-radius: 5px;
  background: var(--color-surface-solid, rgba(0, 0, 0, 0.3));
  color: inherit;
  font: inherit;
  outline: none;
}
.context-menu__search:focus {
  border-color: var(--color-accent, rgba(255, 255, 255, 0.35));
}

.context-menu__item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 8px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
  font: inherit;
}
.context-menu__item.is-active {
  background: var(--color-hover, rgba(255, 255, 255, 0.1));
  color: var(--color-heading, #fff);
}
.context-menu__item.is-disabled {
  opacity: 0.4;
  cursor: default;
}
.context-menu__item.is-danger {
  color: var(--paragraph-error, var(--color-text));
}
.context-menu__item.is-danger.is-active {
  background: color-mix(in srgb, var(--accent-error) 18%, transparent);
}

.context-menu__check {
  flex: none;
  width: 12px;
  text-align: center;
  color: var(--color-text-muted, rgba(255, 255, 255, 0.5));
}
.context-menu__swatch {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 1px solid color-mix(in srgb, var(--paragraph) 25%, transparent);
  vertical-align: middle;
}
.context-menu__icon {
  /* A leading glyph (editor-toolbar dropdowns). Sized to match the check
     column so the label stays aligned with the ✓/swatch rows. */
  font-size: 11px;
  line-height: 1;
  text-align: center;
  color: var(--color-text-muted, rgba(255, 255, 255, 0.7));
}
.context-menu__item.is-active .context-menu__swatch,
.context-menu__check.is-on .context-menu__swatch {
  box-shadow: 0 0 0 2px var(--color-heading, #fff);
}

.context-menu__label {
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.context-menu__chevron {
  flex: none;
  color: var(--color-text-muted, rgba(255, 255, 255, 0.5));
}
</style>