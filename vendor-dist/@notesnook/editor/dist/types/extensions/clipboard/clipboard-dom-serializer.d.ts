import { DOMSerializer } from "@tiptap/pm/model";
import { Fragment, Schema } from "prosemirror-model";
export declare class ClipboardDOMSerializer extends DOMSerializer {
    static fromSchema(schema: Schema): ClipboardDOMSerializer;
    serializeFragment(fragment: Fragment, options?: {
        document?: Document | undefined;
    } | undefined, target?: HTMLElement | DocumentFragment | undefined): HTMLElement | DocumentFragment;
}
