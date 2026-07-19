import { MenuItem } from "@notesnook/ui";
type DropdownProps = {
    id: string;
    group: string;
    selectedItem: string | JSX.Element;
    items: MenuItem[];
    buttonRef?: React.MutableRefObject<HTMLButtonElement | undefined>;
    menuWidth?: number;
    disabled?: boolean;
};
export declare function Dropdown(props: DropdownProps): import("react/jsx-runtime").JSX.Element;
export {};
