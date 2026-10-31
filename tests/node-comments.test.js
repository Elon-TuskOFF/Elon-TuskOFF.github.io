import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCommentsServer } from "../server/index.js";
import { normalizeIP, trustedProxies, clientIP } from "../server/ip.js";

async function start(t, options = {}) {
  const directory = mkdtempSync(join(tmpdir(), "node-comments-"));
  const publicDirectory = join(directory, "public");
  mkdirSync(publicDirectory);
  writeFileSync(join(publicDirectory, "index.html"), "<!doctype html><h1>Server catalog</h1>");
  writeFileSync(join(publicDirectory, "app.js"), "console.log('site');");
  writeFileSync(join(directory, "private.txt"), "must not be public");
  try { symlinkSync(join(directory, "private.txt"), join(publicDirectory, "leak.txt")); }
  catch (error) { if (error.code !== "EPERM") throw error; }
  const server = createCommentsServer({ databasePath: ":memory:", publicDirectory, ...options });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let closed = false;
  async function close() {
    if (closed) return;
    closed = true;
    await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    rmSync(directory, { recursive: true, force: true });
  }
  t.after(close);
  const request = (path, options) => fetch(origin + path, options);
  const post = (value = { server: "gtnh", author: "Гість", text: "Публічний коментар Node.js" }, headers = {}) => request("/api/comments", {
    method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(value),
  });
  return { request, post, origin, close };
}

test("Node API publishes comments and ignores forged client-IP headers by default", async t => {
  const { request, post } = await start(t);
  assert.equal((await (await request("/api/comments?server=gtnh")).json()).total, 0);
  const results = await Promise.all([post(), post()]);
  assert.deepEqual(results.map(response => response.status).sort(), [201, 429]);
  assert(Number(results.find(response => response.status === 429).headers.get("Retry-After")) > 86300);
  const read = await (await request("/api/comments?server=gtnh")).json();
  assert.equal(read.comments[0].text, "Публічний коментар Node.js");
  assert(read.nextAllowedAt);
  assert.equal((await post({ server: "hytale", author: "Гість", text: "Другий" }, {
    "X-Forwarded-For": "192.0.2.77", "CF-Connecting-IP": "192.0.2.88", "X-Real-IP": "192.0.2.99",
  })).status, 429);
  assert(!JSON.stringify(read).includes("127.0.0.1"));
});

test("configured trusted proxies identify distinct visitors without trusting forged prefixes", async t => {
  const { request, post } = await start(t, { trustedProxyCIDRs: "127.0.0.1/32" });
  assert.equal((await post(undefined, { "X-Forwarded-For": "203.0.113.200, 192.0.2.10" })).status, 201);
  assert.equal((await post(undefined, { "X-Forwarded-For": "203.0.113.201, 192.0.2.10" })).status, 429);
  assert.equal((await post(undefined, { "X-Forwarded-For": "192.0.2.11" })).status, 201);
  assert.equal((await post(undefined, { "X-Forwarded-For": "invalid" })).status, 503);
  const otherVisitor = await (await request("/api/comments?server=gtnh", { headers: { "X-Forwarded-For": "192.0.2.12" } })).json();
  assert.equal(otherVisitor.total, 2);
  assert.equal(otherVisitor.nextAllowedAt, null);
});

test("Node API rejects invalid requests without consuming the posting allowance", async t => {
  const { request, post } = await start(t);
  assert.equal((await post({ server: "gtnh", author: " ", text: " " })).status, 400);
  assert.equal((await post({ server: "gtnh", author: "a", text: "x".repeat(9000) })).status, 413);
  assert.equal((await request("/api/comments", { method: "POST", headers: { "Content-Type": "application/json" }, body: "bad JSON" })).status, 400);
  assert.equal((await request("/api/comments", { method: "POST", body: "text" })).status, 415);
  assert.equal((await request("/api/comments", { method: "DELETE" })).status, 405);
  assert.equal((await request("/api/comments?server=unknown")).status, 400);
  assert.equal((await request("/api/comments?server=gtnh&before=bad")).status, 400);
  assert.equal((await post(undefined, { Origin: "https://untrusted.example" })).status, 403);
  const preflight = await request("/api/comments", { method: "OPTIONS", headers: { Origin: "https://elon-tuskoff.github.io" } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("Access-Control-Allow-Origin"), "https://elon-tuskoff.github.io");
  assert.equal((await post(undefined, { Origin: "https://elon-tuskoff.github.io" })).status, 201);
});

test("Node static hosting serves only public files, supports HEAD, and revalidates assets", async t => {
  const { request } = await start(t);
  const index = await request("/");
  assert.equal(index.status, 200);
  assert(index.headers.get("Content-Type").startsWith("text/html"));
  assert((await index.text()).includes("Server catalog"));
  assert.equal((await request("/", { method: "HEAD" })).status, 200);
  assert.equal(await (await request("/", { method: "HEAD" })).text(), "");
  assert.equal((await request("/", { headers: { "If-None-Match": index.headers.get("ETag") } })).status, 304);
  assert((await request("/app.js")).headers.get("Content-Type").startsWith("text/javascript"));
  for (const filename of ["/package.json", "/.env", "/leak.txt", "/%2e%2e%2fprivate.txt", "/..%5cprivate.txt"]) {
    assert.equal((await request(filename)).status, 404, filename);
  }
});

test("Node server preserves comments and allowance across restarts", async t => {
  const directory = mkdtempSync(join(tmpdir(), "node-comments-persistence-"));
  try {
    const options = { databasePath: join(directory, "comments.sqlite") };
    const first = await start(t, options);
    assert.equal((await first.post()).status, 201);
    await first.close();
    const second = await start(t, options);
    const read = await (await second.request("/api/comments?server=gtnh")).json();
    assert.equal(read.total, 1);
    assert.equal((await second.post()).status, 429);
    await second.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("IP normalization and proxy chain selection prevent alternate-text bypasses", () => {
  assert.equal(normalizeIP("::ffff:192.0.2.1"), "192.0.2.1");
  assert.equal(normalizeIP("::ffff:c000:201"), "192.0.2.1");
  assert.equal(normalizeIP("2001:0DB8:0000:0000:0000:0000:0000:0001"), "2001:db8::1");
  assert.equal(normalizeIP("not-an-ip"), null);
  const trusted = trustedProxies("127.0.0.1/32, 10.0.0.0/8, ::1/128");
  assert.equal(clientIP({ socket: { remoteAddress: "::ffff:127.0.0.1" }, headers: { "x-forwarded-for": "198.51.100.1, 192.0.2.1, 10.1.2.3" } }, trusted), "192.0.2.1");
  assert.throws(() => trustedProxies("0.0.0.0/33"), /Invalid trusted proxy/);
});
