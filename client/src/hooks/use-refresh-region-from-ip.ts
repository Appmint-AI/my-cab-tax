import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import i18n from "@/lib/i18n";
import { REGION_DEFAULT_LANGUAGE } from "@/lib/i18n";
import { normalizeDetectedCountry } from "@shared/regional-profile";

const THROTTLE_MS = 12_000;
/** Fallback when IP changes without navigation/focus (e.g. VPN switch while tab stays open). */
const BACKGROUND_POLL_MS = 120_000;
const SESSION_CHECK_KEY_PREFIX = "mct:region-session-check:";
const RELOAD_DEBOUNCE_MS = 4_000;

/**
 * Keeps `detectedCountry` aligned with the client's current egress IP (VPN-aware).
 * Runs on navigate, tab focus / visibility, network reconnect / link change, and periodic poll while visible.
 */
export function useRefreshRegionFromIp() {
  const [location] = useLocation();
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const lastAt = useRef(0);

  async function ping(bypassThrottle: boolean) {
    const now = Date.now();
    if (!bypassThrottle && now - lastAt.current < THROTTLE_MS) return;
    lastAt.current = Date.now();

    try {
      const res = await fetch("/api/user/refresh-country-from-ip", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) return;

      const data = (await res.json()) as {
        updated?: boolean;
        detectedCountry?: string;
        previousCountry?: string | null;
        countryName?: string;
      };

      if (data.updated) {
        queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
        queryClient.invalidateQueries({ queryKey: ["/api/user/region-config"] });
        queryClient.invalidateQueries({ queryKey: ["/api/jurisdiction"] });

        const code = data.detectedCountry || "";
        const lang = REGION_DEFAULT_LANGUAGE[code];
        if (lang) void i18n.changeLanguage(lang);

        toast({
          title: "Tax region updated",
          description: data.countryName
            ? `Using ${data.countryName} (${code}) from your current network. Override anytime under Settings → Home country.`
            : `Locale updated (${code}) from your connection.`,
        });

        const prevIso = normalizeDetectedCountry(data.previousCountry ?? "");
        const nextIso = normalizeDetectedCountry(data.detectedCountry ?? "");
        if (prevIso !== nextIso) {
          const uid = user?.id || "anon";
          const debKey = `mct:region-reload-debounce:${uid}`;
          const last = Number(sessionStorage.getItem(debKey) || 0);
          const now = Date.now();
          if (now - last >= RELOAD_DEBOUNCE_MS) {
            sessionStorage.setItem(debKey, String(now));
            window.location.reload();
          }
        }
      }
    } catch {
      /* intermittent network — ignore */
    }
  }

  useEffect(() => {
    if (!isAuthenticated || !user) return;
    void ping(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ping on route changes only via location dep
  }, [isAuthenticated, user?.id, location]);

  useEffect(() => {
    if (!isAuthenticated || !user) return;
    const uid = user.id || "anon";
    const sessionCheckKey = `${SESSION_CHECK_KEY_PREFIX}${uid}`;
    if (sessionStorage.getItem(sessionCheckKey) === "1") return;
    sessionStorage.setItem(sessionCheckKey, "1");
    lastAt.current = 0;
    void ping(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per authenticated browser session/user
  }, [isAuthenticated, user?.id]);

  useEffect(() => {
    if (!isAuthenticated || !user) return;

    const onResume = () => {
      if (document.visibilityState !== "visible") return;
      lastAt.current = 0;
      void ping(true);
    };

    window.addEventListener("focus", onResume);
    document.addEventListener("visibilitychange", onResume);

    return () => {
      window.removeEventListener("focus", onResume);
      document.removeEventListener("visibilitychange", onResume);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, user?.id]);

  useEffect(() => {
    if (!isAuthenticated || !user) return;

    const onOnline = () => {
      lastAt.current = 0;
      void ping(true);
    };

    /** Many VPN reconnects briefly drop the browser "online" state or change the underlying link. */
    window.addEventListener("online", onOnline);

    let connectionDebounced: ReturnType<typeof setTimeout> | undefined;
    const conn = typeof navigator !== "undefined" ? (navigator as Navigator & { connection?: EventTarget }).connection : undefined;
    const onConnectionChange = () => {
      if (document.visibilityState !== "visible") return;
      window.clearTimeout(connectionDebounced);
      connectionDebounced = window.setTimeout(() => {
        lastAt.current = 0;
        void ping(true);
      }, 1500);
    };
    conn?.addEventListener?.("change", onConnectionChange);

    const poll = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void ping(false);
    }, BACKGROUND_POLL_MS);

    return () => {
      window.removeEventListener("online", onOnline);
      conn?.removeEventListener?.("change", onConnectionChange);
      window.clearTimeout(connectionDebounced);
      window.clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, user?.id]);
}
