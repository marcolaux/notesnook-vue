import { Theme } from "@notesnook/theme";
import { SchemeColors } from "@notesnook/theme";
import React from "react";
import { ButtonProps } from "@theme-ui/components";
import { IconNames } from "../icons.js";
import { ToolButtonVariant } from "../types.js";
export type ToolButtonProps = ButtonProps & {
    icon: IconNames;
    iconColor?: SchemeColors;
    iconSize?: keyof Theme["iconSizes"] | number;
    toggled?: boolean;
    buttonRef?: React.RefObject<HTMLButtonElement>;
    variant?: ToolButtonVariant;
    conditional?: boolean;
    force?: boolean;
    parentGroup?: string;
    popupId?: string;
};
export declare const ToolButton: React.NamedExoticComponent<ToolButtonProps>;
