import { Editor } from "../../types.js";
type ColorPickerProps = {
    editor: Editor;
    colors?: string[];
    defaultColors?: string[];
    color?: string;
    onClear: () => void;
    expanded?: boolean;
    onChange: (color: string) => void;
    onClose?: () => void;
    isPinned?: boolean;
    onPin?: () => void;
    title?: string;
    onSave?: (color: string) => void;
    cacheKey?: string;
    onDelete?: (color: string) => void;
};
export declare function ColorPicker(props: ColorPickerProps): import("react/jsx-runtime").JSX.Element;
export {};
