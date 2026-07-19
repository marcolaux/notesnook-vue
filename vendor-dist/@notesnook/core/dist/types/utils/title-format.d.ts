import { TimeFormat, DayFormat } from "../types.js";
export declare const NEWLINE_STRIP_REGEX: RegExp;
export declare const HEADLINE_REGEX: RegExp;
export declare function formatTitle(titleFormat: string, dateFormat: string, timeFormat: TimeFormat, dayFormat: DayFormat, headline?: string, totalNotes?: number): string;
