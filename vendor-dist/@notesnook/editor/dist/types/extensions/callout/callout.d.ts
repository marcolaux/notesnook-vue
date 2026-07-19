import { Node } from "@tiptap/core";
declare module "@tiptap/core" {
    interface Commands<ReturnType> {
        callout: {
            /**
             * Set a code block
             */
            setCallout: (attributes: CalloutAttributes) => ReturnType;
        };
    }
}
declare const CALLOUT_TYPES: readonly ["note", "abstract", "summary", "tldr", "info", "todo", "tip", "hint", "important", "success", "check", "done", "question", "help", "faq", "warning", "warn", "caution", "attention", "failure", "fail", "missing", "danger", "error", "bug", "example", "quote", "cite"];
type CalloutType = (typeof CALLOUT_TYPES)[number];
export type CalloutAttributes = {
    type: CalloutType;
};
export declare const Callout: Node<any, any>;
export {};
