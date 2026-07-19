import { Node } from "@tiptap/core";
import { Node as ProseMirrorNode } from "@tiptap/pm/model";
export interface CheckListItemOptions {
    onReadOnlyChecked?: (node: ProseMirrorNode, checked: boolean) => boolean;
    nested: boolean;
    HTMLAttributes: Record<string, any>;
}
export declare const CheckListItem: Node<CheckListItemOptions, any>;
