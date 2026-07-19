import { FontSizes } from "./fontsize.js";
export type FontConfig = {
    fontSizes: FontSizes;
    fontWeights: {
        normal: number;
        body: number;
        heading: number;
        bold: number;
        medium: number;
    };
    fonts: {
        body: string;
        monospace: string;
        heading: string;
    };
};
export declare function getFontConfig(): FontConfig;
