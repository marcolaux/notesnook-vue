import Database from "./index.js";
import { Monograph, Note } from "../types.js";
import { Cipher } from "@notesnook/crypto";
export type MonographAnalytics = {
    totalViews: number;
};
export type PublishOptions = {
    password?: string;
    selfDestruct?: boolean;
};
export declare class Monographs {
    private readonly db;
    monographs: string[];
    constructor(db: Database);
    clear(): Promise<void>;
    refresh(): Promise<void>;
    /**
     * Check if note is published.
     */
    isPublished(noteId: string): boolean;
    /**
     * Get note published monograph id
     */
    monograph(noteId: string): string;
    /**
     * Publish a note as a monograph
     */
    publish(noteId: string, title: string, opts?: PublishOptions): Promise<any>;
    /**
     * Unpublish a note
     */
    unpublish(noteId: string): Promise<void>;
    get all(): import("../index.js").FilteredSelector<Note>;
    get(monographId: string): Promise<Monograph | undefined>;
    decryptPassword(password: Cipher<"base64">): Promise<string>;
    metadata(monographId: string): Promise<{
        publishUrl: string;
        analytics: MonographAnalytics;
    }>;
}
