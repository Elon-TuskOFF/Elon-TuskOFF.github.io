import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

// Test in Wrangler's own Worker runtime without adding another dependency.
const require = createRequire(import.meta.url);
const { Miniflare, Log, LogLevel, convertV4MiniflareOptions } = await import(pathToFileURL(require.resolve("miniflare", { paths: [require.resolve("wrangler")] })));

test("Worker API shares comments, enforces atomic IP limits, and checks requests", async () => {
  const mf = new Miniflare(convertV4MiniflareOptions({
    modulesRoot: fileURLToPath(new URL("../worker/", import.meta.url)),
    modules: [
      { type: "ESModule", path: fileURLToPath(new URL("../worker/index.js", import.meta.url)) },
      { type: "ESModule", path: fileURLToPath(new URL("../worker/store.js", import.meta.url)) },
    ],
    compatibilityDate: "2026-10-27",
    durableObjects: { COMMENTS: { className: "CommentStore", useSQLite: true } },
    log: new Log(LogLevel.NONE),
  }));
  const url = "https://website.example/api/comments";
  const get = (server = "gtnh", ip = "192.0.2.10") => mf.dispatchFetch(`${url}?server=${server}`, { headers: { "CF-Connecting-IP": ip } });
  const post = (ip, value = { server: "gtnh", author: "Гість", text: "Публічний коментар" }, extra = {}) => mf.dispatchFetch(url, {
    method: "POST", headers: { "Content-Type": "application/json", "CF-Connecting-IP": ip, ...extra }, body: JSON.stringify(value),
  });
  try {
    const initial = await get();
    assert.equal(initial.status, 200);
    assert.equal((await initial.json()).total, 0);
    const responses = await Promise.all([post("192.0.2.10"), post("192.0.2.10")]);
    assert.deepEqual(responses.map(r => r.status).sort(), [201, 429]);
    const blocked = responses.find(r => r.status === 429);
    assert(Number(blocked.headers.get("Retry-After")) > 86300);
    assert((await blocked.json()).nextAllowedAt);
    const otherVisitor = await (await get("gtnh", "192.0.2.11")).json();
    assert.equal(otherVisitor.comments[0].text, "Публічний коментар");
    assert.equal(otherVisitor.nextAllowedAt, null);
    assert(!JSON.stringify(otherVisitor).includes("192.0.2.10"));
    assert.equal((await post("192.0.2.10", { server: "hytale", author: "Гість", text: "Ще один" }, { "X-Comments-Client-IP": "forged", "CF-Connecting-IPv6": "2001:db8::999", "X-Forwarded-For": "198.51.100.50" })).status, 429);
    assert.equal((await post("192.0.2.11")).status, 201);
    assert.equal((await get("unknown")).status, 400);
    assert.equal((await mf.dispatchFetch(`${url}?server=gtnh&before=bad`)).status, 400);
    assert.equal((await mf.dispatchFetch(url, { method: "POST", headers: { "CF-Connecting-IP": "192.0.2.99", "Content-Type": "text/plain" }, body: "{}" })).status, 415);
    assert.equal((await mf.dispatchFetch(url, { method: "POST", headers: { "CF-Connecting-IP": "192.0.2.99", "Content-Type": "application/json" }, body: "bad JSON" })).status, 400);
    assert.equal((await post("192.0.2.99", { server: "gtnh", author: "a", text: "x".repeat(9000) })).status, 413);
    assert.equal((await post("192.0.2.99", { server: "gtnh", author: "a", text: "x" }, { Origin: "https://untrusted.example" })).status, 403);
    const cors = await mf.dispatchFetch(url, { method: "OPTIONS", headers: { Origin: "https://elon-tuskoff.github.io" } });
    assert.equal(cors.status, 204);
    assert.equal(cors.headers.get("Access-Control-Allow-Origin"), "https://elon-tuskoff.github.io");
    const allowed = await post("192.0.2.99", undefined, { Origin: "https://elon-tuskoff.github.io" });
    assert.equal(allowed.status, 201);
    assert.equal(allowed.headers.get("Access-Control-Allow-Origin"), "https://elon-tuskoff.github.io");
  } finally { await mf.dispose(); }
});
