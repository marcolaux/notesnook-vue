/**
 * First contract test — pins the shape of `@notesnook/core`'s public exports.
 *
 * If @notesnook/core ever removes/renames `Database`, `Note`, `IStorage`, etc.
 * this test fails before any application code breaks. Run it on every CI build
 * and every time you bump the `@notesnook/core` version.
 *
 * This test does NOT exercise the Database at runtime — it only asserts the
 * compile-time + runtime presence of the contract surface. Real behavior tests
 * (notes.add, sync.start, vault.unlock, …) live alongside this one and DO
 * exercise the engine against an in-memory SQLite.
 */
import { describe, it, expect } from "vitest";
import * as core from "@notesnook/core";
import type {
  Database,
  Note,
  Notebook,
  Tag,
  Color,
  Reminder,
  Attachment,
  Vault,
  IStorage,
  IFileStorage,
  ICompressor,
  SQLiteOptions,
  DatabaseUpdatedEvent
} from "@notesnook/core";

describe("contract: @notesnook/core public surface", () => {
  it("exports the Database class", () => {
    expect(core.Database).toBeTypeOf("function");
  });

  it("exports EMPTY_CONTENT constant", () => {
    expect(core.EMPTY_CONTENT).toBeDefined();
  });

  it("exports VAULT_ERRORS", () => {
    expect(core.VAULT_ERRORS).toBeDefined();
  });

  it("exports sanitizeTag function", () => {
    expect(core.sanitizeTag).toBeTypeOf("function");
  });

  it("exports DataURL", () => {
    expect(core.DataURL).toBeDefined();
  });

  it("Database can be constructed", () => {
    const db = new core.Database();
    expect(db).toBeInstanceOf(core.Database);
  });

  it("type-only imports resolve", () => {
    // Compile-time only — if any of these types disappear, tsc fails first.
    const _check: Pick<Note, "id" | "type" | "contentId"> = {
      id: "",
      type: "note",
      contentId: ""
    };
    expect(_check).toBeDefined();
  });
});