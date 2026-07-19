import Database from "./index.js";
export type NoteStats = {
    totalNotes: number;
    totalWords: number;
    totalMonographs: number;
    mostNotesCreatedInMonth: {
        month: string;
        count: number;
    } | null;
    mostNotesCreatedInDay: {
        day: string;
        count: number;
    } | null;
    monthlyStats: Record<string, number>;
    dayOfWeekStats: Record<string, number>;
    largestNote: {
        title: string;
        length: number;
    } | null;
};
export type OrganizationStats = {
    totalNotebooks: number;
    totalTags: number;
    mostUsedTags: {
        id: string;
        title: string;
        noteCount: number;
    }[];
    mostActiveNotebooks: {
        id: string;
        title: string;
        noteCount: number;
    }[];
    totalColors: number;
};
export type AttachmentStats = {
    totalAttachments: number;
    totalStorageUsed: number;
    largestAttachment: {
        id: string;
        filename: string;
        size: number;
    } | null;
    mostCommonFileType: string | null;
};
export type WrappedStats = NoteStats & OrganizationStats & AttachmentStats;
export declare class Wrapped {
    private readonly db;
    constructor(db: Database);
    get(): Promise<WrappedStats>;
    private getYearRange;
    private getNoteStats;
    private countItemNotes;
    private getOrganizationStats;
    private getAttachmentStats;
    private countTotalWords;
}
