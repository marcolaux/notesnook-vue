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
 *  - Event shapes (DatabaseUpdatedEvent, sync events)
 *  - Platform interfaces (IStorage, IFileStorage, ICompressor, SQLiteOptions)
 *  - The Database class and its Options
 *
 * When adding a type that your code depends on, add it here first.
 */
export type {
  Note,
  Notebook,
  Topic,
  Tag,
  Color,
  Reminder,
  Attachment,
  Vault,
  Monograph,
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
  FilteredSelector,
  DefaultColors,
  ResolveInternalLink
} from "@notesnook/core";

export {
  Database,
  EMPTY_CONTENT,
  VAULT_ERRORS,
  sanitizeTag,
  DataURL
} from "@notesnook/core";

export type {
  IStorage,
  IFileStorage,
  ICompressor,
  StorageAccessor,
  FileStorageAccessor,
  KVStorageAccessor,
  ConfigStorageAccessor,
  CompressorAccessor,
  CryptoAccessor,
  SQLiteOptions
} from "@notesnook/core";