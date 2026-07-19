import * as CSS from "csstype";
export type ThemeColor = keyof Colors | `${keyof Colors}-${keyof Omit<Variants, "primary">}`;
export type SchemeColors = ThemeColor | CSS.Property.Color;
export type SchemeColorsAsCSSVariables = `var(--${ThemeColor})`;
export declare function isThemeColor(color: string, colors: Colors): color is keyof Colors;
export type ThemeCompatibilityVersion = 1;
/**
 * @title Notesnook Theme schema
 * @description This is a schema for validation of Notesnook themes.
 */
export type ThemeDefinition = {
    /**
     * Name of the theme
     */
    name: string;
    /**
     * ID of the theme. Must be unique across all other themes.
     * @pattern ^[a-z0-9_-]+$
     */
    id: string;
    /**
     * Version of the theme.
     */
    version: number;
    /**
     * The compatibility version of the theme used by the client to
     * decide whether the theme is compatible with the current app version.
     */
    compatibilityVersion: ThemeCompatibilityVersion;
    /**
     * The license under which the theme can be shared, modified etc.
     *
     * @examples ["GPL-3.0-or-later", "Apache-2.0", "BSD-3-Clause", "MIT", "MPL-2.0"]
     */
    license: string;
    /**
     * Author(s) of the theme.
     */
    authors: ThemeAuthor[];
    /**
     * Website or homepage of the theme.
     *
     * @format uri
     */
    homepage?: string;
    /**
     * A short description of the theme.
     */
    description: string;
    /**
     * Whether the theme has a dark color scheme or light.
     */
    colorScheme: "light" | "dark";
    /**
     * Keywords to help categorize the theme & improve search results.
     */
    tags?: string[];
    /**
     * All the theme scopes.
     */
    scopes: ThemeScopes;
    codeBlockCSS: string;
};
export type ThemeAuthor = {
    /**
     * Name of the author.
     */
    name: string;
    /**
     * Contact email of the author.
     */
    email?: string;
    /**
     * Website or support page of the author.
     */
    url?: string;
};
export type ThemeScopes = {
    /**
     * Base theme scope is the only scope that must be 100% specified.
     * There are no optional variants or colors in this scope and it
     * acts as a fallback for all the other scopes in case a color or
     * variant is missing in them.
     */
    base: Variants<true>;
    /**
     * Scope for the title bar on Desktop & Web.
     */
    titleBar?: PartialVariants;
    /**
     * Scope for the status bar on Desktop & mobile. On mobile, the status
     * bar can be found at the bottom of the side navigation menu which
     * includes the sync status, logged in status etc.
     */
    statusBar?: PartialVariants;
    /**
     * Scope for the central list view containing your notes, notebooks, tags etc.
     */
    list?: PartialVariants;
    /**
     * Scope for everything inside the editor excluding the toolbar which has its
     * own scope.
     */
    editor?: PartialVariants;
    /**
     * Scope specific to the Editor Toolbar.
     */
    editorToolbar?: PartialVariants;
    /**
     * Scope for all the Editor side bars include note properties, attachment previews etc.
     */
    editorSidebar?: PartialVariants;
    /**
     * Scope for all the dialogs in the app.
     */
    dialog?: PartialVariants;
    /**
     * Scope for the side navigation menu.
     */
    navigationMenu?: PartialVariants;
    /**
     * Scope for all the context menus in the app. This is desktop/web only since
     * the mobile clients do not have context menus.
     */
    contextMenu?: PartialVariants;
    /**
     * Scope for all the bottom sheets shown in the app. This scope only applies
     * on the mobile clients & the mobile version of the web app.
     */
    sheet?: PartialVariants;
};
export type PartialVariants = Partial<Variants<false>>;
export type PartialOrFullColors<TRequired extends boolean = false> = TRequired extends true ? Colors : Partial<Colors>;
export type Variants<TRequired extends boolean = false> = {
    primary: PartialOrFullColors<TRequired>;
    secondary: PartialOrFullColors<TRequired>;
    disabled: PartialOrFullColors<TRequired>;
    selected: PartialOrFullColors<TRequired>;
    error: PartialOrFullColors<TRequired>;
    success: PartialOrFullColors<TRequired>;
};
export type Colors = {
    /**
     * Only Hex RGB values are supported. No Alpha. (e.g. #f33ff3)
     * @pattern ^#(?:[0-9a-fA-F]{3}){1,2}$
     */
    accent: string;
    /**
     * Only Hex RGB values are supported. No Alpha. (e.g. #f33ff3)
     * @pattern ^#(?:[0-9a-fA-F]{3}){1,2}$
     */
    accentForeground: string;
    /**
     * Only Hex RGB values are supported. No Alpha. (e.g. #f33ff3)
     * @pattern ^#(?:[0-9a-fA-F]{3}){1,2}$
     */
    paragraph: string;
    /**
     * Hex RGB & ARGB values both are supported. (e.g. #dbdbdb99)
     * @pattern ^#(?:(?:[\da-fA-F]{3}){1,2}|(?:[\da-fA-F]{4}){1,2})$
     */
    background: string;
    /**
     * Only Hex RGB values are supported. No Alpha. (e.g. #f33ff3)
     * @pattern ^#(?:[0-9a-fA-F]{3}){1,2}$
     */
    border: string;
    /**
     * Only Hex RGB values are supported. No Alpha. (e.g. #f33ff3)
     * @pattern ^#(?:[0-9a-fA-F]{3}){1,2}$
     */
    heading: string;
    /**
     * Only Hex RGB values are supported. No Alpha. (e.g. #f33ff3)
     * @pattern ^#(?:[0-9a-fA-F]{3}){1,2}$
     */
    icon: string;
    /**
     * Only Hex RGB values are supported. No Alpha. (e.g. #f33ff3)
     * @pattern ^#(?:[0-9a-fA-F]{3}){1,2}$
     */
    separator: string;
    /**
     * Hex RGB & ARGB values both are supported. (e.g. #dbdbdb99)
     * @pattern ^#(?:(?:[\da-fA-F]{3}){1,2}|(?:[\da-fA-F]{4}){1,2})$
     */
    placeholder: string;
    /**
     * Hex RGB & ARGB values both are supported. (e.g. #dbdbdb99)
     * @pattern ^#(?:(?:[\da-fA-F]{3}){1,2}|(?:[\da-fA-F]{4}){1,2})$
     */
    hover: string;
    /**
     * Hex RGB & ARGB values both are supported. (e.g. #dbdbdb99)
     * @pattern ^#(?:(?:[\da-fA-F]{3}){1,2}|(?:[\da-fA-F]{4}){1,2})$
     */
    backdrop: string;
    /**
     * Hex RGB & ARGB values both are supported. (e.g. #dbdbdb99)
     * @pattern ^#(?:(?:[\da-fA-F]{3}){1,2}|(?:[\da-fA-F]{4}){1,2})$
     * @deprecated true
     */
    shade: string;
    /**
     * Hex RGB & ARGB values both are supported. (e.g. #dbdbdb99)
     * @pattern ^#(?:(?:[\da-fA-F]{3}){1,2}|(?:[\da-fA-F]{4}){1,2})$
     * @deprecated true
     */
    textSelection: string;
};
export type VariantsWithStaticColors<TRequired extends boolean = false> = Variants<TRequired> & {
    static: typeof StaticColors;
};
export type PreviewColors = {
    editor: string;
    accentForeground: string;
    navigationMenu: {
        shade: string;
        accent: string;
        background: string;
        icon: string;
    };
    list: {
        heading: string;
        accent: string;
        accentForeground: string;
        background: string;
    };
    statusBar: {
        paragraph: string;
        background: string;
        icon: string;
    };
    border: string;
    paragraph: string;
    background: string;
    accent: string;
};
export declare const StaticColors: {
    readonly red: "#f44336";
    readonly orange: "#FF9800";
    readonly yellow: "#FFD600";
    readonly green: "#4CAF50";
    readonly blue: "#2196F3";
    readonly purple: "#673AB7";
    readonly gray: "#9E9E9E";
    readonly black: "#000000";
    readonly white: "#ffffff";
};
export declare const THEME_SCOPES: readonly (keyof ThemeScopes)[];
export declare const COLORS: readonly (keyof Colors)[];
export declare const ALPHA_COLORS: readonly (keyof Colors)[];
export declare const Variants: readonly (keyof Variants)[];
export declare const DEPRECATED_COLORS: string[];
