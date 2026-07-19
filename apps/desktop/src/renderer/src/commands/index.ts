/**
 * Command registration entry (Phase 2.5). Importing this module (from
 * `main.ts`) pulls in `./app-commands` + `./editor-commands`, whose top-level
 * `registerCommands(...)` calls populate the registry at app load. The palette
 * store reads the registry at filter/execute time; handlers resolve stores
 * lazily (after Pinia is active), so the registration order is safe.
 */
import "./app-commands";
import "./editor-commands";