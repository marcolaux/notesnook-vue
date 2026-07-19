import { Notes } from "../collections/notes.js";
import { CryptoAccessor } from "../utils/crypto.js";
import { FileStorage, FileStorageAccessor } from "../database/fs.js";
import { Notebooks } from "../collections/notebooks.js";
import Trash from "../collections/trash.js";
import Sync, { SyncOptions } from "./sync/index.js";
import { Tags } from "../collections/tags.js";
import { Colors } from "../collections/colors.js";
import Vault from "./vault.js";
import Lookup from "./lookup.js";
import { Content } from "../collections/content.js";
import Backup from "../database/backup.js";
import Hosts from "../utils/constants.js";
import { LegacySettings } from "../collections/legacy-settings.js";
import Migrations from "./migrations.js";
import UserManager from "./user-manager.js";
import { Monographs } from "./monographs.js";
import { Monographs as MonographsCollection } from "../collections/monographs.js";
import { Offers } from "./offers.js";
import { Attachments } from "../collections/attachments.js";
import { Debug } from "./debug.js";
import { Mutex } from "async-mutex";
import { NoteHistory } from "../collections/note-history.js";
import MFAManager from "./mfa-manager.js";
import EventManager from "../utils/event-manager.js";
import { Pricing } from "./pricing.js";
import { Shortcuts } from "../collections/shortcuts.js";
import { Reminders } from "../collections/reminders.js";
import { Relations } from "../collections/relations.js";
import Subscriptions from "./subscriptions.js";
import { InboxItemsHistory } from "../collections/inbox-items-history.js";
import { CompressorAccessor, ConfigStorageAccessor, ICompressor, IFileStorage, IStorage, KVStorageAccessor, StorageAccessor } from "../interfaces.js";
import TokenManager from "./token-manager.js";
import { Settings } from "../collections/settings.js";
import { DatabaseAccessor, DatabaseSchema, SQLiteOptions } from "../database/index.js";
import { Kysely } from "@streetwriters/kysely";
import { CachedCollection } from "../database/cached-collection.js";
import { Vaults } from "../collections/vaults.js";
import { Sanitizer } from "../database/sanitizer.js";
import { InboxApiKeys } from "./inbox-api-keys.js";
import { Circle } from "./circle.js";
import { Wrapped } from "./wrapped.js";
type EventSourceConstructor = new (uri: string, init: EventSourceInit & {
    headers?: Record<string, string>;
}) => EventSource;
type Options = {
    sqliteOptions: SQLiteOptions;
    storage: IStorage;
    eventsource?: EventSourceConstructor;
    fs: IFileStorage;
    compressor: () => Promise<ICompressor>;
    maxNoteVersions: () => Promise<number | undefined>;
    batchSize: number;
};
declare class Database {
    isInitialized: boolean;
    eventManager: EventManager;
    sseMutex: Mutex;
    _fs?: FileStorage;
    _compressor?: Promise<ICompressor>;
    private databaseReady;
    storage: StorageAccessor;
    fs: FileStorageAccessor;
    crypto: CryptoAccessor;
    compressor: CompressorAccessor;
    private _sql?;
    sql: DatabaseAccessor;
    private _kv;
    kv: KVStorageAccessor;
    private _config;
    config: ConfigStorageAccessor;
    private _transaction?;
    transaction: (executor: (tr: Kysely<DatabaseSchema>) => Promise<void>) => Promise<void>;
    options: Options;
    eventSource?: EventSource | null;
    tokenManager: TokenManager;
    mfa: MFAManager;
    subscriptions: Subscriptions;
    circle: Circle;
    offers: typeof Offers;
    debug: Debug;
    pricing: typeof Pricing;
    user: UserManager;
    syncer: Sync;
    vault: Vault;
    lookup: Lookup;
    backup: Backup;
    migrations: Migrations;
    monographs: Monographs;
    trash: Trash;
    sanitizer: Sanitizer;
    monographsCollection: MonographsCollection;
    notebooks: Notebooks;
    tags: Tags;
    colors: Colors;
    content: Content;
    attachments: Attachments;
    noteHistory: NoteHistory;
    shortcuts: Shortcuts;
    reminders: Reminders;
    relations: Relations;
    notes: Notes;
    vaults: Vaults;
    settings: Settings;
    inboxApiKeys: InboxApiKeys;
    inboxItemsHistory: InboxItemsHistory;
    wrapped: Wrapped;
    /**
     * @deprecated only kept here for migration purposes
     */
    legacyTags: CachedCollection<"tags", import("../types.js").Tag>;
    /**
     * @deprecated only kept here for migration purposes
     */
    legacyColors: CachedCollection<"colors", import("../types.js").Color>;
    /**
     * @deprecated only kept here for migration purposes
     */
    legacyNotes: CachedCollection<"notes", import("../types.js").Note | import("../types.js").TrashItem>;
    /**
     * @deprecated only kept here for migration purposes
     */
    legacySettings: LegacySettings;
    setup(options: Options): void;
    reset(): Promise<boolean>;
    changePassword(password?: string): Promise<void>;
    init(): Promise<void>;
    private onInit;
    initCollections(): Promise<void>;
    disconnectSSE(): void;
    /**
     *
     * @param {{force: boolean, error: any}} args
     */
    connectSSE(args?: {
        force: boolean;
    }): Promise<void>;
    lastSynced(): Promise<number>;
    setLastSynced(lastSynced: number): Promise<void>;
    sync(options: SyncOptions): Promise<boolean>;
    hasUnsyncedChanges(): Promise<boolean>;
    host(hosts: typeof Hosts): void;
    version(): Promise<any>;
    announcements(): Promise<any>;
}
export default Database;
