import { VariantsWithStaticColors } from "../theme-engine/types.js";
export type ThemeConfig = {
    colorScheme: "dark" | "light";
    scope: VariantsWithStaticColors;
};
