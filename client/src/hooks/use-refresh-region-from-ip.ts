import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import i18n from "@/lib/i18n";
import { REGION_DEFAULT_LANGUAGE } from "@/lib/i18n";

const THROTTLE_MS = 12_000;

/**
 * Keeps `detectedCountry` aligned with the client's current egress IP (VPN-aware).
 * Runs when you navigate and when the tab regains focus — complements first-login IP geo.
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
}
