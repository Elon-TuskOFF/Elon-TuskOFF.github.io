import { DurableObject } from "cloudflare:workers";
import { CommentRepository, SERVER_IDS } from "./store.js";

const GITHUB_PAGES_ORIGIN = "https://elon-tuskoff.github.io";
const MAX_BODY_BYTES = 8192;

function json(data, status = 200, extraHeaders = {}) {
  return Response.json(data, { status, headers: {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...extraHeaders,
  } });
}

async function readJson(request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("invalid-json");
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new Error("body-too-large");
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(body));
}

export class CommentStore extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.repository = new CommentRepository(ctx.storage);
    this.hashKey = crypto.subtle.importKey(
      "raw", new TextEncoder().encode(this.repository.salt),
      { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
    );
  }

  async fetch(request) {
    const url = new URL(request.url);
    const ip = request.headers.get("X-Comments-Client-IP");
    let ipHash = null;
    if (ip) {
      const hash = await crypto.subtle.sign("HMAC", await this.hashKey, new TextEncoder().encode(ip));
      ipHash = [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, "0")).join("");
    }

    if (request.method === "GET") {
      const server = url.searchParams.get("server");
      if (!SERVER_IDS.has(server)) return json({ error: "Невідомий сервер." }, 400);
      const cursor = url.searchParams.get("before");
      const before = cursor === null ? Number.MAX_SAFE_INTEGER : Number(cursor);
      if (!Number.isSafeInteger(before) || before <= 0) return json({ error: "Некоректна сторінка коментарів." }, 400);
      return json({ ...this.repository.list(server, before), nextAllowedAt: this.repository.nextAllowedAt(ipHash) });
    }

    let value;
    try { value = await readJson(request); }
    catch (error) {
      return json({ error: error.message === "body-too-large" ? "Коментар завеликий." : "Некоректний JSON." }, error.message === "body-too-large" ? 413 : 400);
    }
    const result = this.repository.create(value, ipHash);
    const { status, ...data } = result;
    const headers = status === 429 ? {
      "Retry-After": String(Math.max(1, Math.ceil((Date.parse(data.nextAllowedAt) - Date.now()) / 1000))),
    } : {};
    return json(data, status, headers);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    if (url.pathname !== "/api/comments") return json({ error: "Не знайдено." }, 404);

    const origin = request.headers.get("Origin");
    const allowedOrigin = !origin || origin === url.origin || origin === GITHUB_PAGES_ORIGIN;
    if (!allowedOrigin) return json({ error: "Це джерело запитів не дозволене." }, 403);
    const cors = origin ? {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Expose-Headers": "Retry-After",
      "Vary": "Origin",
    } : {};
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (!["GET", "POST"].includes(request.method)) return json({ error: "Метод не дозволений." }, 405, { ...cors, Allow: "GET, POST, OPTIONS" });
    if (request.method === "POST" && request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
      return json({ error: "Потрібен формат application/json." }, 415, cors);
    }

    // Cloudflare supplies these headers. Ignore caller-supplied forwarded IPs.
    const ip = request.headers.get("CF-Connecting-IP");
    if (request.method === "POST" && !ip) return json({ error: "Не вдалося перевірити IP-адресу. Спробуйте пізніше." }, 503, cors);
    const headers = new Headers({ "Content-Type": "application/json" });
    if (ip) headers.set("X-Comments-Client-IP", ip);

    try {
      const id = env.COMMENTS.idFromName("public-comments-v1");
      const stub = env.COMMENTS.get(id);
      const response = await stub.fetch(new Request(request.url, {
        method: request.method, headers,
        body: request.method === "POST" ? request.body : undefined,
      }));
      const output = new Response(response.body, response);
      for (const [key, value] of Object.entries(cors)) output.headers.set(key, value);
      return output;
    } catch {
      return json({ error: "Коментарі тимчасово недоступні. Спробуйте пізніше." }, 503, cors);
    }
  },
};
