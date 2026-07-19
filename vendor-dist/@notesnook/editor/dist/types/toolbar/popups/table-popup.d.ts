type TableSize = {
    columns: number;
    rows: number;
};
export type TablePopupProps = {
    onInsertTable: (size: TableSize) => void;
};
export declare function TablePopup(props: TablePopupProps): import("react/jsx-runtime").JSX.Element;
export {};
