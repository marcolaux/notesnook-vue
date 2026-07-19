import { InputProps } from "@theme-ui/components";
import { FlexProps } from "@theme-ui/components";
type LabelInputProps = InputProps & {
    label: string;
    containerProps?: FlexProps;
};
export declare function InlineInput(props: LabelInputProps): import("react/jsx-runtime").JSX.Element;
export {};
