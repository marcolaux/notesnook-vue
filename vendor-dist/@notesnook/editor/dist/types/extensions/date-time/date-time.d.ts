import { Extension } from "@tiptap/core";
declare module "@tiptap/core" {
    interface Commands<ReturnType> {
        datetime: {
            /**
             * Insert time at current position
             */
            insertTime: () => ReturnType;
            /**
             * Insert date at current position
             */
            insertDate: () => ReturnType;
            /**
             * Insert day at current position
             */
            insertDay: () => ReturnType;
            /**
             * Insert date & time at current position
             */
            insertDateTime: () => ReturnType;
            /**
             * Insert date & time with time zone at current position
             */
            insertDateTimeWithTimeZone: () => ReturnType;
        };
    }
}
export type DateTimeOptions = {
    dateFormat: string;
    timeFormat: "12-hour" | "24-hour";
    dayFormat: "short" | "long";
};
export declare const DateTime: Extension<DateTimeOptions, any>;
export declare function replaceDateTime(value: string, dateFormat?: string, timeFormat?: "12-hour" | "24-hour", dayFormat?: DateTimeOptions["dayFormat"]): string;
