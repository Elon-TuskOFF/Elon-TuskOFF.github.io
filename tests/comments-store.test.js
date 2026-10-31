import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CommentRepository, COMMENT_WINDOW_MS, PAGE_SIZE } from "../worker/store.js";

function database(file = ":memory:") {
  const db = new DatabaseSync(file);
  const storage = {
    sql: {
      exec(query, ...bindings) {
        let rows;
        if (!bindings.length && query.includes(";")) { db.exec(query); rows = []; }
        else rows = db.prepare(query).all(...bindings);
        return { toArray: () => rows, one: () => { assert.equal(rows.length, 1); return rows[0]; } };
      },
    },
    transactionSync(callback) {
      db.exec("BEGIN");
      try { const value = callback(); db.exec("COMMIT"); return value; }
      catch (error) { db.exec("ROLLBACK"); throw error; }
    },
  };
  return { db, storage, repository: new CommentRepository(storage) };
}
const comment = (server = "gtnh") => ({ server, author: "Гість", text: "Побачимось на сервері!" });

test("rolling 24-hour limit covers all servers and accepts the exact boundary", () => {
  const { db, repository } = database();
  const now = 1_800_000_000_000;
  assert.equal(repository.create(comment(), "hash-a", now).status, 201);
  const blocked = repository.create(comment("hytale"), "hash-a", now + COMMENT_WINDOW_MS - 1);
  assert.equal(blocked.status, 429);
  assert.equal(blocked.nextAllowedAt, new Date(now + COMMENT_WINDOW_MS).toISOString());
  assert.equal(repository.create(comment("hytale"), "hash-b", now).status, 201);
  assert.equal(repository.create(comment("project-zomboid"), "hash-a", now + COMMENT_WINDOW_MS).status, 201);
  db.close();
});

test("invalid input does not consume an allowance and text remains literal", () => {
  const { db, repository } = database();
  for (const invalid of [null, {}, { ...comment(), server: "other" }, { ...comment(), author: " " }, { ...comment(), text: " " }, { ...comment(), author: "a".repeat(61) }, { ...comment(), text: "a".repeat(1001) }]) {
    assert.equal(repository.create(invalid, "hash-a").status, 400);
  }
  assert.equal(repository.create(comment(), null).status, 503);
  const text = "<img src=x onerror=alert(1)>'); DROP TABLE comments; --";
  const result = repository.create({ ...comment(), author: "  Гість  ", text }, "hash-a");
  assert.equal(result.status, 201);
  assert.equal(result.comment.text, text);
  assert.equal(result.comment.author, "Гість");
  assert.equal(repository.list("gtnh").total, 1);
  assert(!JSON.stringify(repository.list("gtnh")).includes("hash-a"));
  db.close();
});

test("rate-limit and comment writes roll back together", () => {
  const { db, storage, repository } = database();
  const original = storage.sql.exec;
  storage.sql.exec = (query, ...values) => {
    if (query.startsWith("INSERT INTO posting_limits")) throw new Error("Storage failure");
    return original(query, ...values);
  };
  assert.throws(() => repository.create(comment(), "hash-a"), /Storage failure/);
  assert.equal(repository.list("gtnh").total, 0);
  storage.sql.exec = original;
  assert.equal(repository.create(comment(), "hash-a").status, 201);
  db.close();
});

test("pagination exposes every comment without duplicates", () => {
  const { db, repository } = database();
  for (let i = 0; i < PAGE_SIZE + 7; i++) repository.create(comment(), `hash-${i}`);
  const first = repository.list("gtnh");
  const second = repository.list("gtnh", first.nextCursor);
  assert.equal(first.comments.length, PAGE_SIZE);
  assert.equal(second.comments.length, 7);
  assert.equal(first.total, PAGE_SIZE + 7);
  assert.equal(second.nextCursor, null);
  assert.equal(new Set([...first.comments, ...second.comments].map(row => row.id)).size, PAGE_SIZE + 7);
  db.close();
});

test("comments, private salt, and allowance survive storage reopening", () => {
  const directory = mkdtempSync(join(tmpdir(), "comments-test-"));
  try {
    const file = join(directory, "comments.sqlite");
    let state = database(file);
    const salt = state.repository.salt;
    const now = Date.now();
    state.repository.create(comment(), "hash-a", now);
    state.db.close();
    state = database(file);
    assert.equal(state.repository.salt, salt);
    assert.equal(state.repository.list("gtnh").total, 1);
    assert.equal(state.repository.create(comment(), "hash-a", now + 1).status, 429);
    state.db.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
