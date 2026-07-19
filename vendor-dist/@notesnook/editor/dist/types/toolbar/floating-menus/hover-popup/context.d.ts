import { NodeWithOffset } from "../../../utils/prosemirror.js";
export declare function useHoverPopupContext(): {
    selectedNode?: NodeWithOffset;
    hide: () => void;
};
export declare const HoverPopupContextProvider: import("react").Provider<{
    selectedNode?: NodeWithOffset;
    hide: () => void;
}>;
