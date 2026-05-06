import type { Request } from "express";

function stripV4Mapped(ip: string): string {
  return ip.replace(/^::ffff:/i, "").trim();
}

/**
 * True when the peer address is not useful for WAN geo (localhost, RFC1918, typical IPv6 ULA/link-local).
 * Browser VPN extensions do not change this when the app runs on your machine — the TCP hop is still local.
 */
export function isNonRoutableClientIpForGeo(ip: string): boolean {
  const clean = stripV4Mapped(ip);
  if (!clean) return true;
  if (clean === "127.0.0.1" || clean === "::1") return true;
  if (clean.startsWith("10.")) return true;
  if (clean.startsWith("192.168.")) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(clean)) return true;
  const lower = clean.toLowerCase();
  if (lower.startsWith("fe80:")) return true;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
  return false;
}

/**
 * Prefer a globally routable client address for geo and audit. Uses `req.ip` when trustworthy,
 * otherwise the first X-Forwarded-For hop or the TCP peer.
 */
export function getClientIp(req: Request): string | null {
  const fromTrustProxy = req.ip;
  // ::ffff:127.0.0.1 is still loopback — treat as local so we fall through to XFF or socket.
  if (fromTrustProxy && !isNonRoutableClientIpForGeo(fromTrustProxy)) {
    return stripV4Mapped(fromTrustProxy);
  }

  const xff = req.headers["x-forwarded-for"];
  const first = Array.isArray(xff) ? xff[0] : typeof xff === "string" ? xff.split(",")[0] : "";
  if (first && first.trim()) {
    return stripV4Mapped(first.trim());
  }

  const ra = req.socket?.remoteAddress;
  if (ra) return stripV4Mapped(ra);
  return null;
}
