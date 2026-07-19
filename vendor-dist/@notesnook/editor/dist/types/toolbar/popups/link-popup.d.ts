import { LinkDefinition } from "../tools/link.js";
import { Editor } from "@tiptap/core";
export type LinkPopupProps = {
    link?: LinkDefinition;
    isEditing?: boolean;
    onDone: (link: LinkDefinition) => void;
    onClose: () => void;
    isImageActive?: boolean;
};
export declare function LinkPopup(props: LinkPopupProps): import("react/jsx-runtime").JSX.Element;
export declare function showLinkPopup(editor: Editor): Promise<void>;
