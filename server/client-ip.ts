import type { Request } from "express";

function stripV4Mapped(ip: string): string {
  return ip.replace(/^::ffff:/i, "").trim();
}

/**
 * Client IP for geolocation and audit logs.
 * With `app.set("trust proxy", true)` (Cloud Run / load balancers), Express sets `req.ip`
 * from X-Forwarded-For. This helper prefers that and falls back to parsing the header or socket.
 */
export function getClientIp(req: Request): string | null {
  const fromTrustProxy = req.ip;
  if (fromTrustProxy && fromTrustProxy !== "::1" && fromTrustProxy !== "127.0.0.1") {
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
