import { isNonRoutableClientIpForGeo } from "./client-ip";
import { log } from "./index";

export interface GeoResult {
  countryCode: string;
  countryName: string;
}

const GEO_TIMEOUT_MS = 8_000;

/** Some geo APIs throttle or reject Node’s default user agent. */
const GEO_HEADERS: Record<string, string> = {
  Accept: "application/json",
  "User-Agent": "MyCabTax/1.0 (server-side geo lookup)",
};

async function geoFromBigDataCloud(cleanIp: string): Promise<GeoResult | null> {
  const key =
    process.env.BIGDATACLOUD_IP_GEO_KEY ||
    "bdc_4422d41470b04a2eb0c50959ae1b8da0";
  const url = `https://api.bigdatacloud.net/data/ip-geolocation?ip=${encodeURIComponent(cleanIp)}&localityLanguage=en&key=${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(GEO_TIMEOUT_MS),
    headers: GEO_HEADERS,
  });
  if (!res.ok) return null;
  const data = await res.json();
  const iso = data?.country?.isoAlpha2;
  const name = data?.country?.name;
  if (
    typeof iso === "string" &&
    iso.length === 2 &&
    typeof name === "string" &&
    name.length > 0
  ) {
    return {
      countryCode: iso.toUpperCase(),
      countryName: name,
    };
  }
  return null;
}

async function geoFromIpinfo(cleanIp: string): Promise<GeoResult | null> {
  const token = process.env.IPINFO_ACCESS_TOKEN?.trim();
  if (!token) return null;
  const q = new URLSearchParams({ token }).toString();
  const url = `https://ipinfo.io/${encodeURIComponent(cleanIp)}/json?${q}`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(GEO_TIMEOUT_MS),
    headers: GEO_HEADERS,
  });
  if (!res.ok) return null;
  const data = await res.json();
  const code =
    typeof data.country === "string" ? data.country.trim().toUpperCase() : "";
  const name =
    typeof data.country_name === "string" && data.country_name.trim().length > 0
      ? data.country_name.trim()
      : code;
  if (code.length === 2) {
    return { countryCode: code, countryName: name };
  }
  return null;
}

async function geoFromIpApiCo(cleanIp: string): Promise<GeoResult | null> {
  const url = `https://ipapi.co/${encodeURIComponent(cleanIp)}/json/`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(GEO_TIMEOUT_MS),
    headers: GEO_HEADERS,
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (data?.error === true || data?.reason) return null;
  const code = typeof data.country_code === "string" ? data.country_code.trim() : "";
  const name =
    typeof data.country_name === "string"
      ? data.country_name.trim()
      : typeof data.country_code === "string"
        ? data.country_code.trim()
        : "";
  if (code.length === 2) {
    return {
      countryCode: code.toUpperCase(),
      countryName: name.length > 0 ? name : code.toUpperCase(),
    };
  }
  return null;
}

async function geoFromGeoJs(cleanIp: string): Promise<GeoResult | null> {
  const url = `https://get.geojs.io/v1/ip/geo/${encodeURIComponent(cleanIp)}.json`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(GEO_TIMEOUT_MS),
    headers: GEO_HEADERS,
  });
  if (!res.ok) return null;
  const data = await res.json();
  const code =
    typeof data.country_code === "string"
      ? data.country_code.trim()
      : "";
  const name =
    typeof data.country === "string" ? data.country.trim() : "";
  if (code.length === 2 && name.length > 0) {
    return { countryCode: code.toUpperCase(), countryName: name };
  }
  return code.length === 2
    ? { countryCode: code.toUpperCase(), countryName: code.toUpperCase() }
    : null;
}

async function geoFromIpWhoIs(cleanIp: string): Promise<GeoResult | null> {
  const res = await fetch(
    `https://ipwho.is/${encodeURIComponent(cleanIp)}`,
    {
      signal: AbortSignal.timeout(GEO_TIMEOUT_MS),
      headers: GEO_HEADERS,
    }
  );
  if (!res.ok) return null;
  const data = (await res.json()) as Record<string, unknown>;
  if (data.success === false) return null;
  const code =
    typeof data.country_code === "string"
      ? data.country_code.trim()
      : "";
  const country =
    typeof data.country === "string" ? data.country.trim() : "";
  if (code.length !== 2) return null;
  if (country.length > 0) {
    return {
      countryCode: code.toUpperCase(),
      countryName: country,
    };
  }
  return { countryCode: code.toUpperCase(), countryName: code.toUpperCase() };
}

export async function detectCountryFromIP(ip: string): Promise<GeoResult | null> {
  try {
    if (isNonRoutableClientIpForGeo(ip)) {
      return null;
    }
    let cleanIp = ip.replace(/^::ffff:/i, "").trim();
    if (cleanIp.startsWith("[") && cleanIp.endsWith("]")) {
      cleanIp = cleanIp.slice(1, -1);
    }
    if (!cleanIp) return null;

    /** Try providers in order; outbound HTTPS must be allowed in production. GeoJS/keyless first. */
    const providers = [
      geoFromGeoJs,
      geoFromIpApiCo,
      geoFromIpWhoIs,
      geoFromBigDataCloud,
      geoFromIpinfo,
    ] as const;

    const errors: string[] = [];
    for (const probe of providers) {
      try {
        const geo = await probe(cleanIp);
        if (geo?.countryCode) return geo;
      } catch (e: unknown) {
        const msg =
          e instanceof Error
            ? e.message
            : typeof e === "object" &&
                e !== null &&
                "message" in e &&
                typeof (e as Error).message === "string"
              ? (e as Error).message
              : String(e);
        errors.push(msg);
      }
    }

    if (errors.length > 0) {
      log(
        `Geo: all providers exhausted (${cleanIp.includes(":") ? "IPv6" : "IPv4"}): ${errors
          .slice(0, 4)
          .join(" | ")}`,
        "geo"
      );
    } else {
      log(
        `Geo: every provider returned empty (${cleanIp.includes(":") ? "IPv6" : "IPv4"})`,
        "geo"
      );
    }
    return null;
  } catch (error: any) {
    log(`Geo detection failed for IP: ${error.message}`, "geo");
    return null;
  }
}

export type RegionType = "US" | "UK" | "CA" | "MX" | "NO" | "SE" | "DK" | "EU" | "MY" | "CN" | "ID" | "BR" | "ZA" | "NG" | "OTHER";

/** UK Self Assessment jurisdiction (England, Scotland, Wales, Northern Ireland) — distinct tax bands/rules. */
export const UK_SELF_ASSESSMENT_REGIONS = ["ENG", "SCT", "WLS", "NIE"] as const;
export type UkSelfAssessmentRegion = (typeof UK_SELF_ASSESSMENT_REGIONS)[number];

const EU_COUNTRIES = new Set([
  "AT","BE","BG","HR","CY","CZ","EE","FI","FR","DE","GR","HU",
  "IE","IT","LV","LT","LU","MT","NL","PL","PT","RO","SK","SI","ES",
]);

/** ISO 3166-1 alpha-2 for persistence; callers may send "UK" colloquially. */
export function normalizeCountryCodeInput(countryCode: string): string {
  const c = countryCode.trim().toUpperCase();
  if (c === "UK") return "GB";
  return c;
}

export function getRegionFromCountry(countryCode: string | null | undefined): RegionType {
  if (!countryCode) return "US";
  const code = countryCode.trim().toUpperCase();
  if (code === "UK" || code === "GB") return "UK";
  if (code === "US") return "US";
  if (code === "CA") return "CA";
  if (code === "MX") return "MX";
  if (code === "NO") return "NO";
  if (code === "SE") return "SE";
  if (code === "DK") return "DK";
  if (code === "MY") return "MY";
  if (code === "CN") return "CN";
  if (code === "ID") return "ID";
  if (code === "BR") return "BR";
  if (code === "ZA") return "ZA";
  if (code === "NG") return "NG";
  if (EU_COUNTRIES.has(code)) return "EU";
  return "OTHER";
}

export interface RegionConfig {
  region: RegionType;
  currency: string;
  currencySymbol: string;
  locale: string;
  taxModules: {
    showScheduleC: boolean;
    showEstimatedTax: boolean;
    showSelfEmploymentTax: boolean;
    showMTDQuarterly: boolean;
    showUniversalCredit: boolean;
    showFinalDeclaration: boolean;
    showTaxOverview: boolean;
  };
}

export function getRegionConfig(countryCode: string | null | undefined): RegionConfig {
  const region = getRegionFromCountry(countryCode);

  const taxModulesUS = { showScheduleC: true, showEstimatedTax: true, showSelfEmploymentTax: true, showMTDQuarterly: false, showUniversalCredit: false, showFinalDeclaration: false, showTaxOverview: false };
  const taxModulesUK = { showScheduleC: false, showEstimatedTax: false, showSelfEmploymentTax: false, showMTDQuarterly: true, showUniversalCredit: true, showFinalDeclaration: true, showTaxOverview: true };
  const taxModulesGeneral = { showScheduleC: false, showEstimatedTax: true, showSelfEmploymentTax: true, showMTDQuarterly: false, showUniversalCredit: false, showFinalDeclaration: false, showTaxOverview: true };

  const configs: Record<RegionType, RegionConfig> = {
    US: { region: "US", currency: "USD", currencySymbol: "$", locale: "en-US", taxModules: taxModulesUS },
    UK: { region: "UK", currency: "GBP", currencySymbol: "£", locale: "en-GB", taxModules: taxModulesUK },
    CA: { region: "CA", currency: "CAD", currencySymbol: "CA$", locale: "en-CA", taxModules: taxModulesGeneral },
    MX: { region: "MX", currency: "MXN", currencySymbol: "MX$", locale: "es-MX", taxModules: taxModulesGeneral },
    NO: { region: "NO", currency: "NOK", currencySymbol: "kr", locale: "nb-NO", taxModules: taxModulesGeneral },
    SE: { region: "SE", currency: "SEK", currencySymbol: "kr", locale: "sv-SE", taxModules: taxModulesGeneral },
    DK: { region: "DK", currency: "DKK", currencySymbol: "kr", locale: "da-DK", taxModules: taxModulesGeneral },
    EU: { region: "EU", currency: "EUR", currencySymbol: "€", locale: "en-EU", taxModules: taxModulesGeneral },
    MY: { region: "MY", currency: "MYR", currencySymbol: "RM", locale: "ms-MY", taxModules: taxModulesGeneral },
    CN: { region: "CN", currency: "CNY", currencySymbol: "¥", locale: "zh-CN", taxModules: taxModulesGeneral },
    ID: { region: "ID", currency: "IDR", currencySymbol: "Rp", locale: "id-ID", taxModules: taxModulesGeneral },
    BR: { region: "BR", currency: "BRL", currencySymbol: "R$", locale: "pt-BR", taxModules: taxModulesGeneral },
    ZA: { region: "ZA", currency: "ZAR", currencySymbol: "R", locale: "en-ZA", taxModules: taxModulesGeneral },
    NG: { region: "NG", currency: "NGN", currencySymbol: "₦", locale: "en-NG", taxModules: taxModulesGeneral },
    OTHER: { region: "OTHER", currency: "USD", currencySymbol: "$", locale: "en-US", taxModules: taxModulesUS },
  };

  return configs[region] || configs["US"];
}
