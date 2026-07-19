import { ImageAttributes } from "../../extensions/image/index.js";
export type ImageUploadPopupProps = {
    onInsert: (image: Partial<ImageAttributes>) => void;
    onClose: () => void;
};
export declare function ImageUploadPopup(props: ImageUploadPopupProps): import("react/jsx-runtime").JSX.Element;
