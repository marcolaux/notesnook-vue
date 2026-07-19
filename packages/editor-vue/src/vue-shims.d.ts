/**
 * Vue SFC module shim — lets plain `tsc` (non-vue-tsc) and IDE tooling resolve
 * `import X from "./Component.vue"` as an opaque Vue component. Real SFC
 * type-checking is owned by `apps/desktop`'s `tsconfig.web.json` (vue-tsc),
 * which compiles the `.vue` files directly via its widened `include`.
 */
declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>;
  export default component;
}