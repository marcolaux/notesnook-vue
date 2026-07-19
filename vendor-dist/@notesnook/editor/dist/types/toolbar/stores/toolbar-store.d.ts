import { DownloadOptions } from "../../utils/downloader.js";
export type ToolbarLocation = "top" | "bottom";
export type PopupRef = {
    id: string;
    group: string;
    pinned?: boolean;
    parent?: string;
};
interface ToolbarState {
    downloadOptions?: DownloadOptions;
    setDownloadOptions: (options?: DownloadOptions) => void;
    isMobile: boolean;
    openedPopups: Record<string, PopupRef | false | undefined>;
    setIsMobile: (isMobile: boolean) => void;
    toolbarLocation: ToolbarLocation;
    setToolbarLocation: (location: ToolbarLocation) => void;
    isPopupOpen: (popupId: string) => boolean;
    openPopup: (ref: PopupRef) => void;
    closePopup: (popupId: string) => void;
    closePopupGroup: (groupId: string, excluded: string[]) => void;
    closeAllPopups: () => void;
    fontFamily: string;
    setFontFamily: (fontFamily: string) => void;
    fontSize: number;
    setFontSize: (fontSize: number) => void;
}
export declare const useToolbarStore: import("zustand").UseBoundStore<import("zustand").StoreApi<ToolbarState>>;
export declare function useToolbarLocation(): ToolbarLocation;
export declare function useIsMobile(): boolean;
export declare function usePopupManager(options: {
    id: string;
    group: string;
    parent?: string;
}): {
    isOpen: boolean;
    open: () => void;
    close: () => void;
    toggle: () => void;
    isPinned: boolean;
    togglePinned: () => void;
};
export {};
