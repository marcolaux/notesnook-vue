/**
 * Main-process safe storage — persists bootstrap secrets (e.g. the
 * `databaseKey`) encrypted with Electron `safeStorage` (OS keychain:
 * macOS Keychain, Windows DPAPI, Linux libsecret). Encrypted blobs are kept in
 * `userData/secrets.json`.
 *
 * Mirrors the upstream `apps/desktop/src/api/safe-storage.ts` encrypt/decrypt
 * surface but adds persistence on the Main side (upstream keeps persistence in
 * the renderer's IndexedDB; for the single bootstrap key a Main file is
 * simpler and avoids an IndexedDB round-trip before the DB can be opened).
 *
 * If `safeStorage.isEncryptionAvailable()` is false (e.g. headless Linux without
 * a keyring) values are stored in plain base64 with a warning, so dev still
 * works. `PORTABLE_EXECUTABLE_DIR` disables encryption on portable Windows
 * builds (upstream behaviour).
 */
import { app, safeStorage } from "electron";
import path from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
import { registerSafeStorageServer } from "../contracts/router";
import type { SafeStorageServer } from "../contracts/router";

function secretsFile(): string {
  return path.join(app.getPath("userData"), "secrets.json");
}

function readAll(): Record<string, string> {
  try {
    return JSON.parse(readFileSync(secretsFile(), "utf-8")) as Record<string, string>;
  } catch {
    return {};
  }
}

function writeAll(map: Record<string, string>): void {
  writeFileSync(secretsFile(), JSON.stringify(map));
}

function encryptionAvailable(): boolean {
  return !process.env["PORTABLE_EXECUTABLE_DIR"] && safeStorage.isEncryptionAvailable();
}

export const safeStorageServer: SafeStorageServer = {
  async isEncryptionAvailable(): Promise<boolean> {
    return encryptionAvailable();
  },

  async set(key: string, value: string): Promise<void> {
    const map = readAll();
    if (encryptionAvailable()) {
      map[key] = safeStorage.encryptString(value).toString("base64");
    } else {
      if (!process.env["PORTABLE_EXECUTABLE_DIR"]) {
        console.warn("[safe-storage] safeStorage unavailable — storing secret unencrypted");
      }
      map[key] = value;
    }
    writeAll(map);
  },

  async get(key: string): Promise<string | undefined> {
    const map = readAll();
    const raw = map[key];
    if (raw === undefined) return undefined;
    if (encryptionAvailable()) {
      return safeStorage.decryptString(Buffer.from(raw, "base64"));
    }
    return raw;
  },

  async remove(key: string): Promise<void> {
    const map = readAll();
    delete map[key];
    writeAll(map);
  }
};

export function registerSafeStorage(): void {
  registerSafeStorageServer(safeStorageServer);
}