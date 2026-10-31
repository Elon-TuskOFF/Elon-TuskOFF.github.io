import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { createHmac } from "node:crypto";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CommentRepository, SERVER_IDS } from "../worker/store.js";
import { openCommentDatabase } from "./sqlite.js";
import { clientIP, trustedProxies } from "./ip.js";

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MAX_BODY_BYTES = 8192;
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".png": "image/png",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".gif": "image/gif", ".svg": "image/svg+xml", ".ico": "image/x-icon",
};

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function json(response, status, body, headers = {}) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff", ...headers,
  });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  if (Number(request.headers["content-length"]) > MAX_BODY_BYTES) {
    request.resume();
    throw new HttpError(413, "Коментар завеликий.");
  }
  // Do not destroy the socket when rejecting an oversized streamed body.
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    size += chunk.byteLength;
    if (size > MAX_BODY_BYTES) { request.resume(); throw new HttpError(413, "Коментар завеликий."); }
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new HttpError(400, "Некоректний JSON."); }
}

function originAllowed(origin, request, allowedOrigins) {
  if (!origin) return true; // Command-line clients do not send an Origin header.
  if (allowedOrigins.has(origin)) return true;
  try {
    const url = new URL(origin);
    return ["http:", "https:"].includes(url.protocol) && url.origin === origin && url.host === request.headers.host;
  } catch { return false; }
}

export function createCommentsServer(options = {}) {
  const publicDirectory = resolve(options.publicDirectory || resolve(PROJECT_ROOT, "dist"));
  const databasePath = options.databasePath || resolve(process.env.DATA_DIR || resolve(PROJECT_ROOT, "data"), "comments.sqlite");
  const database = openCommentDatabase(databasePath);
  const repository = new CommentRepository(database.storage);
  const isTrusted = trustedProxies(options.trustedProxyCIDRs ?? process.env.TRUSTED_PROXY_CIDRS ?? "");
  const allowedOrigins = new Set((options.allowedOrigins ?? process.env.ALLOWED_ORIGINS ?? "https://elon-tuskoff.github.io")
    .split(",").map(value => value.trim()).filter(Boolean));

  async function api(request, response, url) {
    if (url.pathname !== "/api/comments") return json(response, 404, { error: "Не знайдено." });
    const origin = request.headers.origin;
    if (!originAllowed(origin, request, allowedOrigins)) return json(response, 403, { error: "Це джерело запитів не дозволене." });
    const cors = origin ? {
      "Access-Control-Allow-Origin": origin, "Vary": "Origin",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Expose-Headers": "Retry-After",
    } : {};
    if (request.method === "OPTIONS") { response.writeHead(204, cors); response.end(); return; }
    if (!["GET", "POST"].includes(request.method)) return json(response, 405, { error: "Метод не дозволений." }, { ...cors, Allow: "GET, POST, OPTIONS" });

    const ip = clientIP(request, isTrusted);
    const ipHash = ip ? createHmac("sha256", repository.salt).update(ip).digest("hex") : null;
    if (request.method === "GET") {
      const server = url.searchParams.get("server");
      if (!SERVER_IDS.has(server)) return json(response, 400, { error: "Невідомий сервер." }, cors);
      const value = url.searchParams.get("before");
      const before = value === null ? Number.MAX_SAFE_INTEGER : Number(value);
      if (!Number.isSafeInteger(before) || before <= 0) return json(response, 400, { error: "Некоректна сторінка коментарів." }, cors);
      return json(response, 200, { ...repository.list(server, before), nextAllowedAt: repository.nextAllowedAt(ipHash) }, cors);
    }
    if (request.headers["content-type"]?.split(";")[0].trim().toLowerCase() !== "application/json") {
      request.resume();
      return json(response, 415, { error: "Потрібен формат application/json." }, cors);
    }
    if (!ipHash) { request.resume(); return json(response, 503, { error: "Не вдалося перевірити IP-адресу." }, cors); }
    let value;
    try { value = await readJson(request); }
    catch (error) { if (error instanceof HttpError) return json(response, error.status, { error: error.message }, cors); throw error; }
    const { status, ...data } = repository.create(value, ipHash);
    if (status === 429) cors["Retry-After"] = String(Math.max(1, Math.ceil((Date.parse(data.nextAllowedAt) - Date.now()) / 1000)));
    return json(response, status, data, cors);
  }

  async function assets(request, response, url) {
    if (!["GET", "HEAD"].includes(request.method)) return json(response, 405, { error: "Метод не дозволений." }, { Allow: "GET, HEAD" });
    let pathname;
    try { pathname = decodeURIComponent(url.pathname); }
    catch { return json(response, 400, { error: "Некоректна адреса." }); }
    if (pathname.includes("\\") || pathname.includes("\0") || pathname.split("/").some(part => part.startsWith("."))) {
      return json(response, 404, { error: "Не знайдено." });
    }
    const filename = resolve(publicDirectory, "." + (pathname === "/" ? "/index.html" : pathname));
    if (!filename.startsWith(publicDirectory + sep)) return json(response, 404, { error: "Не знайдено." });
    let info, actual;
    try {
      actual = await realpath(filename);
      if (!actual.startsWith(await realpath(publicDirectory) + sep)) return json(response, 404, { error: "Не знайдено." });
      info = await stat(actual);
      if (!info.isFile()) return json(response, 404, { error: "Не знайдено." });
    } catch { return json(response, 404, { error: "Не знайдено." }); }
    const etag = `W/"${info.size}-${info.mtimeMs}"`;
    const headers = {
      "Content-Type": MIME_TYPES[extname(actual).toLowerCase()] || "application/octet-stream",
      "Content-Length": info.size, "Cache-Control": "public, max-age=0, must-revalidate",
      "X-Content-Type-Options": "nosniff", "ETag": etag,
    };
    if (request.headers["if-none-match"] === etag) { response.writeHead(304, { ETag: etag }); response.end(); return; }
    response.writeHead(200, headers);
    if (request.method === "HEAD") { response.end(); return; }
    const stream = createReadStream(actual);
    stream.on("error", () => response.destroy());
    stream.pipe(response);
  }

  const server = createServer({ maxHeaderSize: 8192 }, (request, response) => {
    let url;
    try { url = new URL(request.url, "http://localhost"); }
    catch { json(response, 400, { error: "Некоректна адреса." }); return; }
    const handler = url.pathname.startsWith("/api/") ? api : assets;
    handler(request, response, url).catch(() => {
      if (!response.headersSent) json(response, 500, { error: "Сервер тимчасово недоступний." });
      else response.destroy();
    });
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 5000;
  server.maxHeadersCount = 50;
  server.on("close", database.close);
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be between 1 and 65535.");
  const server = createCommentsServer();
  server.listen(port, process.env.HOST || "0.0.0.0", () => console.log(`Website and comments server listening on port ${port}.`));
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { server.close(); server.closeIdleConnections(); });
}
