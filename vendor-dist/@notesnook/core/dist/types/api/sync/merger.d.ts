import Database from "../index.js";
import { Attachment, ContentItem, Item, MaybeDeletedItem } from "../../types.js";
import { SyncInboxItem } from "./types.js";
declare class Merger {
    private readonly db;
    logger: import("@notesnook/logger").ILogger;
    constructor(db: Database);
    mergeItem(remoteItem: MaybeDeletedItem<Item>, localItem: MaybeDeletedItem<Item> | undefined): MaybeDeletedItem<Item> | undefined;
    mergeContent(remoteItem: MaybeDeletedItem<Item>, localItem: MaybeDeletedItem<Item> | undefined): MaybeDeletedItem<Item> | undefined;
    mergeAttachment(remoteItem: MaybeDeletedItem<Attachment>, localItem: MaybeDeletedItem<Attachment> | undefined): Promise<MaybeDeletedItem<Item> | undefined>;
}
export default Merger;
export declare function isContentConflicted(localItem: ContentItem, remoteItem: ContentItem, conflictThreshold: number): "conflict" | "merge" | undefined;
export declare function handleInboxItems(inboxItems: SyncInboxItem[], db: Database): Promise<void>;
