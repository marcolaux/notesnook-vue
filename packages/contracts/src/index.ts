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
 *  - `Monograph` (singular) does not exist — only the `Monographs` collection
 *    class is exported.
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
  ResolveInternalLink
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
  hosts
} from "@notesnook/core";

export type {
  Cipher,
  SerializedKey,
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