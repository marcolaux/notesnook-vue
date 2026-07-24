import Database from "better-sqlite3-multiple-ciphers";
import * as sqliteVec from "sqlite-vec";

console.log("=== Phase 0 Spike A: Testing sqlite-vec with better-sqlite3-multiple-ciphers ===");

try {
  const db = new Database(":memory:");
  sqliteVec.load(db);

  const { vec_version } = db.prepare("SELECT vec_version() as vec_version").get();
  console.log(`1. sqlite-vec version: ${vec_version}`);

  // Test: vec0 virtual table
  db.exec(`
    CREATE VIRTUAL TABLE vec_notes USING vec0(
      +note_id text,
      +chunk_index integer,
      +chunk_hash text,
      embedding float[384] distance_metric=cosine
    );
  `);
  console.log("2. Created vec0 virtual table with +metadata columns and distance_metric=cosine!");

  const sampleVector1 = new Float32Array(384).fill(0.1);
  const sampleVector2 = new Float32Array(384).fill(0.9);

  const insertStmt = db.prepare(`
    INSERT INTO vec_notes(note_id, chunk_index, chunk_hash, embedding)
    VALUES (?, ?, ?, ?)
  `);

  insertStmt.run("note_1", BigInt(0), "hash_123", sampleVector1);
  insertStmt.run("note_2", BigInt(1), "hash_456", sampleVector2);
  console.log("3. Inserted sample embeddings into vec_notes!");

  const queryVector = new Float32Array(384).fill(0.12);
  const results = db.prepare(`
    SELECT rowid, note_id, chunk_index, distance
    FROM vec_notes
    WHERE embedding MATCH ?
    ORDER BY distance
    LIMIT 5
  `).all(queryVector);

  console.log("4. KNN Vector Search Results:");
  console.log(results);
  console.log("=== Spike A PASSED CLEANLY! ===");
} catch (err) {
  console.error("Spike A Failed with Error:", err);
  process.exit(1);
}
