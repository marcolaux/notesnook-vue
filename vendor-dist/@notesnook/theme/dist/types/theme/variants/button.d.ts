import { ThemeUIStyleObject } from "@theme-ui/core";
import { SchemeColors } from "../../theme-engine/types.js";
export declare const createButtonVariant: (background?: SchemeColors, color?: SchemeColors, states?: {
    hover?: ThemeUIStyleObject;
    active?: ThemeUIStyleObject;
}) => ThemeUIStyleObject;
export declare const buttonVariants: {
    primary: ThemeUIStyleObject;
    secondary: ThemeUIStyleObject;
    tertiary: import("@theme-ui/core").ThemeUICSSObject;
    accent: ThemeUIStyleObject;
    accentSecondary: ThemeUIStyleObject;
    error: ThemeUIStyleObject;
    errorSecondary: ThemeUIStyleObject;
    anchor: import("@theme-ui/core").ThemeUICSSObject;
    dialog: import("@theme-ui/core").ThemeUICSSObject;
    statusitem: import("@theme-ui/core").ThemeUICSSObject;
    icon: import("@theme-ui/core").ThemeUICSSObject;
    menuitem: import("@theme-ui/core").ThemeUICSSObject;
};
