import { Mark } from "@tiptap/core";
export interface LinkProtocolOptions {
    scheme: string;
    optionalSlashes?: boolean;
}
export interface LinkOptions {
    /**
     * If enabled, it adds links as you type.
     */
    autolink: boolean;
    /**
     * An array of custom protocols to be registered with linkifyjs.
     */
    protocols: Array<LinkProtocolOptions | string>;
    /**
     * If enabled, links will be opened on click.
     */
    openOnClick: boolean;
    /**
     * Adds a link to the current selection if the pasted content only contains an url.
     */
    linkOnPaste: boolean;
    /**
     * A list of HTML attributes to be rendered.
     */
    HTMLAttributes: Record<string, any>;
    /**
     * A validation function that modifies link verification for the auto linker.
     * @param url - The url to be validated.
     * @returns - True if the url is valid, false otherwise.
     */
    validate?: (url: string) => boolean;
}
export type LinkAttributes = {
    href: string;
    target?: string | null;
    rel?: string | null;
    class?: string | null;
    title?: string | null;
};
declare module "@tiptap/core" {
    interface Commands<ReturnType> {
        link: {
            /**
             * Set a link mark
             */
            setLink: (attributes: LinkAttributes) => ReturnType;
            /**
             * Toggle a link mark
             */
            toggleLink: (attributes: LinkAttributes) => ReturnType;
            /**
             * Unset a link mark
             */
            unsetLink: () => ReturnType;
        };
    }
}
export declare const linkRegex: RegExp;
export declare const Link: Mark<LinkOptions, any>;
