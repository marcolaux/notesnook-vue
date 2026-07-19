import { TimeFormat, DayFormat } from "../types.js";
export declare function getWeekGroupFromTimestamp(timestamp: number): string;
export declare function getTimeFormat(format: TimeFormat): "hh:mm A" | "HH:mm";
export type TimeZoneOptions = {
    type: "timezone";
};
export type TimeOptions = {
    type: "time";
    timeFormat: TimeFormat;
};
export type DateOptions = {
    type: "date";
    dateFormat: string;
};
export type DayOptions = {
    type: "day";
    dayFormat: DayFormat;
};
export type DateTimeOptions = {
    type: "date-time";
    dateFormat: string;
    timeFormat: TimeFormat;
};
export type DateTimeWithTimeZoneOptions = {
    type: "date-time-timezone";
    dateFormat: string;
    timeFormat: TimeFormat;
};
export type FormatDateOptions = TimeZoneOptions | TimeOptions | DateOptions | DayOptions | DateTimeOptions | DateTimeWithTimeZoneOptions;
export declare function formatDate(date: string | number | Date | null | undefined, options?: FormatDateOptions): string;
export declare const MONTHS_FULL: string[];
