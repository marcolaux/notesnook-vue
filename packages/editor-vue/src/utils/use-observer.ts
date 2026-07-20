/*
Vue 3 composable port of @notesnook/editor's React `useObserver` hook
(hooks/use-observer.ts, GPL-3.0) — an `IntersectionObserver` that reports
whether an element is in view, with a `once` flag to stop after the first
intersection. Used by the image node-view to lazy-load attachment blobs.

Scoped differences from upstream:
  - The observer `root` is the viewport (`null`). Upstream uses
    `ref.current.closest(".ms-container")` (the upstream editor's scroll
    container), which is not present in this port; the editor pane scrolls
    inside a different container, and viewport-intersection is sufficient
    for lazy-loading (an image scrolled out of the viewport is not rendered).
  - The element is passed in as a ref (owned + bound by the component) rather
    than created internally, so a `watch` can (re-)observe when the target
    mounts/unmounts (the image `<img>`/frame may render conditionally).
*/
import { ref, watch, onBeforeUnmount, type Ref } from "vue";

export interface UseObserverOptions {
  threshold: number;
  rootMargin?: string;
  once?: boolean;
}

export function useObserver<T extends Element = Element>(
  elRef: Ref<T | null>,
  options: UseObserverOptions
): { inView: Ref<boolean | undefined> } {
  const inView = ref<boolean | undefined>(undefined);
  let observer: IntersectionObserver | undefined;
  let current: T | null = null;

  function attach(el: T | null): void {
    if (current === el) return;
    if (current) observer?.unobserve(current);
    current = el;
    if (!el) return;
    if (!observer) {
      observer = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          if (!entry) return;
          const r = entry.boundingClientRect;
          // eslint-disable-next-line no-console
          console.log(
            "[image-obs] observer fired",
            "isIntersecting=",
            entry.isIntersecting,
            "ratio=",
            entry.intersectionRatio,
            "rect=",
            r
              ? { top: r.top, left: r.left, width: r.width, height: r.height }
              : "(none)",
            "viewport=",
            typeof window !== "undefined"
              ? `${window.innerWidth}x${window.innerHeight}`
              : "(no window)",
            "inView=",
            inView.value,
            "once=",
            options.once
          );
          if (inView.value && options.once) return;
          inView.value = entry.isIntersecting;
        },
        {
          threshold: options.threshold,
          rootMargin: options.rootMargin ?? "0px",
          root: null
        }
      );
    }
    observer.observe(el);
  }

  // `flush: "post"` so the DOM is settled before we observe the new element.
  watch(elRef, attach, { immediate: true, flush: "post" });

  onBeforeUnmount(() => {
    if (current) observer?.unobserve(current);
    observer?.disconnect();
    observer = undefined;
    current = null;
  });

  return { inView };
}