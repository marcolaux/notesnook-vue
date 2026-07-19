import { Node } from "@tiptap/core";
import { CaretPosition, CodeLine } from "./utils.js";
interface Indent {
    type: "tab" | "space";
    amount: number;
}
export type CodeBlockAttributes = {
    indentType: Indent["type"];
    indentLength: number;
    language: string;
    lines: CodeLine[];
    caretPosition?: CaretPosition;
};
export interface CodeBlockOptions {
    /**
     * Adds a prefix to language classes that are applied to code tags.
     * Defaults to `'language-'`.
     */
    languageClassPrefix: string;
    /**
     * Define whether the node should be exited on triple enter.
     * Defaults to `true`.
     */
    exitOnTripleEnter: boolean;
    /**
     * Define whether the node should be exited on arrow down if there is no node after it.
     * Defaults to `true`.
     */
    exitOnArrowDown: boolean;
    /**
     * Define whether the node should be exited on arrow up if there is no node before it.
     * Defaults to `true`.
     */
    exitOnArrowUp: boolean;
    /**
     * Custom HTML attributes that should be added to the rendered HTML tag.
     */
    HTMLAttributes: Record<string, unknown>;
}
declare module "@tiptap/core" {
    interface Commands<ReturnType> {
        codeblock: {
            /**
             * Set a code block
             */
            setCodeBlock: (attributes?: {
                language: string;
            }) => ReturnType;
            /**
             * Toggle a code block
             */
            toggleCodeBlock: (attributes?: {
                language: string;
            }) => ReturnType;
            /**
             * Change code block indentation options
             */
            changeCodeBlockIndentation: (options: Indent) => ReturnType;
        };
    }
}
export declare const backtickInputRegex: RegExp;
export declare const tildeInputRegex: RegExp;
export declare const CodeBlock: Node<CodeBlockOptions, any>;
export declare function inferLanguage(node: Element): string | undefined;
export {};
