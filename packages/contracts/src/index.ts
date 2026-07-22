/**
 * Single source of truth for the Notesnook data-engine contract.
 *
 * Every component, store, and platform implementation in this repo MUST import
 * Notesnook domain types from here — never directly from `@notesnook/core`.
 * This keeps the upgrade surface small: when `@notesnook/core` ships a breaking
 * change, the compiler fails in exactly one file.
 *
 * Re-exported here:
 *  - Domain entities (Note, Notebook, Tag, Color, Reminder, Attachment, Vault, ...)
 *  - Event shapes (DatabaseUpdatedEvent)
 *  - Platform interfaces (IStorage, IFileStorage, ICompressor, accessor types)
 *  - The Database class and its construction options (Options, SQLiteOptions)
 *
 * Notes:
 *  - `@notesnook/core` does not publicly export `SQLiteOptions` or
 *    `FileStorageAccessor` as named symbols — `SQLiteOptions` is derived from
 *    the Database constructor's options bag, and `FileStorageAccessor` is
 *    derived similarly from the options bag. If a future `core` version
 *    re-exports them, replace the derived types with direct re-exports.
 *  - `Monograph` (singular, the published-note row) and `HistorySession`
 *    (per-note revision) ARE exported by core's types barrel — re-exported
 *    below for the Phase 5.1 publish + note-history stores.
 *
 * When adding a type that your code depends on, add it here first.
 */
import { Database } from "@notesnook/core";

export type {
  Note,
  Notebook,
  Topic,
  Tag,
  Color,
  Reminder,
  Attachment,
  Vault,
  ContentItem,
  Shortcut,
  Relation,
  ItemType,
  ItemMap,
  GroupingKey,
  NoteContent,
  DatabaseUpdatedEvent,
  BackupFile,
  LegacyBackupFile,
  ResolveInternalLink,
  User,
  TimeFormat,
  TrashCleanupInterval,
  Profile,
  DayFormat,
  WeekFormat,
  SyncOptions,
  Monograph,
  HistorySession,
  SessionContentItem,
  ToolbarConfig,
  ToolbarConfigPlatforms,
  /** A settings row. `key` is constrained to `keyof SettingItemMap`; custom
   *  namespaced keys (e.g. our `custom:notebookIcons`) must be cast on write
   *  via the bypass path — see `stores/notebook-icons.ts`. */
  SettingItem
} from "@notesnook/core";

export type {
  IStorage,
  IFileStorage,
  ICompressor,
  StorageAccessor,
  KVStorageAccessor,
  ConfigStorageAccessor,
  CompressorAccessor,
  CryptoAccessor
} from "@notesnook/core";

export {
  Database,
  EMPTY_CONTENT,
  VAULT_ERRORS,
  sanitizeTag,
  DataURL,
  DefaultColors,
  FilteredSelector,
  Monographs,
  hosts,
  EV,
  EVENTS,
  isReminderActive,
  formatReminderTime,
  /** Deterministic MD5 id used by the settings collection (`makeId(key)` → row
   *  id). Re-exported so custom settings rows (e.g. `custom:notebookIcons`)
   *  compute the same id across devices. */
  makeId
} from "@notesnook/core";

// `getUpcomingReminderTime` is exported by core's `collections/reminders`
// module but NOT hoisted to the barrel `index`. Rather than patch the vendored
// dist barrel (the old build-vendor shim 3), import it via a subpath export
// (`./collections/reminders`) that our build script adds to the vendored
// `@notesnook/core` package.json — using upstream's real function with zero
// patches to core's dist/source.
export { getUpcomingReminderTime } from "@notesnook/core/collections/reminders";

export type {
  Cipher,
  SerializedKey,
  SerializedKeyPair,
  DataFormat
} from "@notesnook/crypto";

export type {
  RequestOptions,
  Output,
  FileEncryptionMetadata,
  FileEncryptionMetadataWithHash,
  FileEncryptionMetadataWithOutputType
} from "@notesnook/core";

/**
 * `Cancellable<T>` — `@notesnook/core` defines this but does not publicly
 * re-export it. Mirrored here from `core/dist/index.d.ts` so `IFileStorage`
 * consumers don't need a private import. If core ever exports it, replace
 * this with `export type { Cancellable } from "@notesnook/core"`.
 */
export type Cancellable<T> = {
  execute(): Promise<T>;
  cancel(reason?: string): Promise<void>;
};

/**
 * The options accepted by `Database.setup(...)` — the canonical "Options"
 * bag. `@notesnook/core` keeps `Options` internal today; we derive it from
 * the `setup` method signature so we never have to track renames manually.
 * If `core` ever exports it, replace this with
 * `export type { Options } from "@notesnook/core"`.
 */
export type DatabaseOptions = Parameters<Database["setup"]>[0];

/**
 * SQLiteOptions — derived from the Database options bag. `@notesnook/core`
 * keeps this type internal today; if a future version re-exports it, replace
 * this line with `export type { SQLiteOptions } from "@notesnook/core"`.
 */
export type SQLiteOptions = DatabaseOptions extends { sqliteOptions: infer T }
  ? T
  : never;

/**
 * FileStorageAccessor — derived from the Database options bag. Same caveat
 * as SQLiteOptions.
 */
export type FileStorageAccessor = DatabaseOptions extends { fs: infer T }
  ? T
  : never;