// @vitest-environment happy-dom
/**
 * Repro for the "focused-pane editor surface only applies to the active pane"
 * change: verifies that a component computed depending on
 * `layout.activeGroupId` (the store) and a pane `groupId` flips correctly when
 * `setActiveGroup` is called — the exact reactivity path `Editor.vue` /
 * `NoteTabs.vue` use for `isPaneFocused`.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { defineComponent, computed, h } from "vue";
import { useEditorLayoutStore } from "@/stores/editor-layout";

/** Minimal component mirroring Editor.vue's `isPaneFocused` computed: it
 *  reads `layout.activeGroupId` + a `groupId` prop and renders the surface
 *  class only when they match. */
const PaneProbe = defineComponent({
  props: { groupId: { type: String, required: true } },
  setup(props) {
    const layout = useEditorLayoutStore();
    const isPaneFocused = computed(() => layout.activeGroupId === props.groupId);
    // Mirror Editor.vue: full-intensity surface on the focused pane, half-
    // intensity "inactive" surface on the others (never the plain shell).
    return () =>
      h("div", {
        class: ["probe", isPaneFocused.value ? "editor-pane-surface" : "editor-pane-inactive"]
      });
  }
});

beforeEach(() => {
  setActivePinia(createPinia());
});

describe("focused-pane surface reactivity", () => {
  it("focused pane gets the full surface, sibling gets the inactive one", async () => {
    const layout = useEditorLayoutStore();
    layout.init();
    const rootId = layout.activeGroupId;
    expect(rootId).toBeTruthy();

    // Open a note in the root group so a tab exists there.
    const t1 = layout.openNote("note-a");
    const groupOfT1 = layout.tabs[t1]?.groupId;
    expect(groupOfT1).toBe(rootId);

    // Split the root group → a second sibling group, which becomes focused.
    const siblingId = layout.splitGroup();
    expect(siblingId).toBeTruthy();
    expect(layout.activeGroupId).toBe(siblingId);

    const rootProbe = mount(PaneProbe, { props: { groupId: rootId } });
    const sibProbe = mount(PaneProbe, { props: { groupId: siblingId } });

    // Sibling is focused → full surface; root is inactive → inactive surface.
    expect(sibProbe.classes()).toContain("editor-pane-surface");
    expect(sibProbe.classes()).not.toContain("editor-pane-inactive");
    expect(rootProbe.classes()).toContain("editor-pane-inactive");
    expect(rootProbe.classes()).not.toContain("editor-pane-surface");

    // Focus the root pane → the classes swap reactively.
    layout.setActiveGroup(rootId);
    await rootProbe.vm.$nextTick();
    await sibProbe.vm.$nextTick();
    expect(rootProbe.classes()).toContain("editor-pane-surface");
    expect(rootProbe.classes()).not.toContain("editor-pane-inactive");
    expect(sibProbe.classes()).toContain("editor-pane-inactive");
    expect(sibProbe.classes()).not.toContain("editor-pane-surface");

    rootProbe.unmount();
    sibProbe.unmount();
  });
});