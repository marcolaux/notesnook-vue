export declare function fuzzy<T>(query: string, items: T[], getIdentifier: (item: T) => string, fields: Partial<Record<keyof T, number>>, options?: {
    limit?: number;
    prefix?: string;
    suffix?: string;
}): T[];
