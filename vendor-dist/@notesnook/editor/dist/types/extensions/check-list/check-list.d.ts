import { Node } from "@tiptap/core";
export interface CheckListOptions {
    itemTypeName: string;
    HTMLAttributes: Record<string, any>;
}
declare module "@tiptap/core" {
    interface Commands<ReturnType> {
        checkList: {
            /**
             * Toggle a check list
             */
            toggleCheckList: () => ReturnType;
        };
    }
}
export declare const CheckList: Node<CheckListOptions, any>;
