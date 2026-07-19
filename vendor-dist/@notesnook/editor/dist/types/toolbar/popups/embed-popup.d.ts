import { Embed, EmbedSizeOptions } from "../../extensions/embed/index.js";
export type EmbedPopupProps = {
    onClose: (embed?: Embed) => void;
    title: string;
    embed?: Embed;
    onSizeChanged?: (size: EmbedSizeOptions) => void;
};
export declare function EmbedPopup(props: EmbedPopupProps): import("react/jsx-runtime").JSX.Element;
