import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

/** Adapt Node's persistent SQLite connection to the shared comment repository. */
export function openCommentDatabase(filename) {
  if (filename !== ":memory:") mkdirSync(dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
  const storage = {
    sql: {
      exec(query, ...bindings) {
        let rows;
        if (!bindings.length && query.includes(";")) { db.exec(query); rows = []; }
        else rows = db.prepare(query).all(...bindings);
        return {
          toArray: () => rows,
          one: () => {
            if (rows.length !== 1) throw new Error("Expected exactly one database row.");
            return rows[0];
          },
        };
      },
    },
    transactionSync(callback) {
      db.exec("BEGIN IMMEDIATE");
      try { const result = callback(); db.exec("COMMIT"); return result; }
      catch (error) { db.exec("ROLLBACK"); throw error; }
    },
  };
  return { storage, close: () => db.close() };
}
