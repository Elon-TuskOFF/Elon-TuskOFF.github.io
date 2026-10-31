import { BlockList, isIP } from "node:net";

export function normalizeIP(value) {
  if (typeof value !== "string") return null;
  const ip = value.trim();
  const version = isIP(ip);
  if (version === 4) return ip;
  if (version !== 6 || ip.includes("%")) return null;
  const normalized = new URL(`http://[${ip}]/`).hostname.slice(1, -1);
  const mapped = /^::ffff:([0-9a-f]+):([0-9a-f]+)$/.exec(normalized);
  if (mapped) {
    const high = parseInt(mapped[1], 16), low = parseInt(mapped[2], 16);
    return [high >> 8, high & 255, low >> 8, low & 255].join(".");
  }
  return normalized;
}

/** Only explicitly configured proxy addresses may supply forwarded addresses. */
export function trustedProxies(configuration = "") {
  const ranges = new BlockList();
  for (const entry of configuration.split(",").map(value => value.trim()).filter(Boolean)) {
    const [address, prefix, ...extra] = entry.split("/");
    const ip = normalizeIP(address);
    if (!ip || extra.length) throw new Error(`Invalid trusted proxy range: ${entry}`);
    const version = isIP(ip), type = version === 4 ? "ipv4" : "ipv6";
    if (prefix === undefined) ranges.addAddress(ip, type);
    else {
      if (!/^\d+$/.test(prefix) || Number(prefix) > (version === 4 ? 32 : 128)) throw new Error(`Invalid trusted proxy range: ${entry}`);
      ranges.addSubnet(ip, Number(prefix), type);
    }
  }
  return ip => Boolean(ip && ranges.check(ip, isIP(ip) === 4 ? "ipv4" : "ipv6"));
}

export function clientIP(request, isTrusted) {
  let address = normalizeIP(request.socket.remoteAddress);
  if (!address || !isTrusted(address)) return address;
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded !== "string") return null;
  const chain = forwarded.split(",").map(normalizeIP);
  if (!chain.length || chain.length > 32 || chain.some(ip => !ip)) return null;
  while (chain.length && isTrusted(address)) address = chain.pop();
  return address;
}
