export const COMMENT_WINDOW_MS = 24 * 60 * 60 * 1000;
export const SERVER_IDS = new Set(["gtnh", "hytale", "project-zomboid"]);
export const PAGE_SIZE = 20;

export function validateComment(value) {
  if (!value || !SERVER_IDS.has(value.server)) return { error: "Невідомий сервер." };
  const author = typeof value.author === "string" ? value.author.trim() : "";
  const text = typeof value.text === "string" ? value.text.trim() : "";
  if (!author || author.length > 60) return { error: "Вкажіть ім’я — від 1 до 60 символів." };
  if (!text || text.length > 1000) return { error: "Напишіть коментар — від 1 до 1000 символів." };
  return { comment: { server: value.server, author, text } };
}

function publicComment(row) {
  return { id: row.id, author: row.author, text: row.body, createdAt: new Date(row.created_at).toISOString() };
}

/** One shared object serializes posting across all server discussions. */
export class CommentRepository {
  constructor(storage) {
    this.storage = storage;
    this.sql = storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        server TEXT NOT NULL,
        author TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS comments_by_server ON comments(server, id DESC);
      CREATE TABLE IF NOT EXISTS posting_limits (
        ip_hash TEXT PRIMARY KEY,
        next_post_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS limits_by_expiry ON posting_limits(next_post_at);
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    `);
    this.sql.exec("INSERT OR IGNORE INTO settings (key, value) VALUES ('ip-salt', ?)", crypto.randomUUID() + crypto.randomUUID());
    this.salt = this.sql.exec("SELECT value FROM settings WHERE key = 'ip-salt'").one().value;
  }

  nextAllowedAt(ipHash, now = Date.now()) {
    if (!ipHash) return null;
    const row = this.sql.exec("SELECT next_post_at FROM posting_limits WHERE ip_hash = ?", ipHash).toArray()[0];
    return row && row.next_post_at > now ? new Date(row.next_post_at).toISOString() : null;
  }

  list(server, before = Number.MAX_SAFE_INTEGER) {
    const rows = this.sql.exec(
      "SELECT id, author, body, created_at FROM comments WHERE server = ? AND id < ? ORDER BY id DESC LIMIT ?",
      server, before, PAGE_SIZE + 1,
    ).toArray();
    const page = rows.slice(0, PAGE_SIZE);
    const total = this.sql.exec("SELECT COUNT(*) AS total FROM comments WHERE server = ?", server).one().total;
    return {
      comments: page.map(publicComment),
      total,
      nextCursor: rows.length > PAGE_SIZE ? page.at(-1).id : null,
    };
  }

  create(value, ipHash, now = Date.now()) {
    const validation = validateComment(value);
    if (validation.error) return { status: 400, error: validation.error };
    if (!ipHash) return { status: 503, error: "Не вдалося перевірити IP-адресу. Спробуйте пізніше." };

    // Check and consume the allowance in the same transaction as the insert.
    // Concurrent submissions and posting to another server cannot bypass it.
    return this.storage.transactionSync(() => {
      const nextAllowedAt = this.nextAllowedAt(ipHash, now);
      if (nextAllowedAt) return { status: 429, error: "З однієї IP-адреси можна публікувати один коментар кожні 24 години.", nextAllowedAt };

      this.sql.exec("DELETE FROM posting_limits WHERE next_post_at <= ?", now);
      const { server, author, text } = validation.comment;
      const row = this.sql.exec(
        "INSERT INTO comments (server, author, body, created_at) VALUES (?, ?, ?, ?) RETURNING id, author, body, created_at",
        server, author, text, now,
      ).one();
      const nextPostAt = now + COMMENT_WINDOW_MS;
      this.sql.exec(
        "INSERT INTO posting_limits (ip_hash, next_post_at) VALUES (?, ?) ON CONFLICT(ip_hash) DO UPDATE SET next_post_at = excluded.next_post_at",
        ipHash, nextPostAt,
      );
      return { status: 201, comment: publicComment(row), nextAllowedAt: new Date(nextPostAt).toISOString() };
    });
  }
}
