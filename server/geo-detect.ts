import { isNonRoutableClientIpForGeo } from "./client-ip";
import { log } from "./index";

export interface GeoResult {
  countryCode: string;
  countryName: string;
}

async function geoFromIpWhoIs(cleanIp: string): Promise<GeoResult | null> {
  try {
    const res = await fetch(`https://ipwho.is/${encodeURIComponent(cleanIp)}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      success?: boolean;
      country_code?: string;
      country?: string;
    };
    if (data.success && data.country_code && data.country) {
      return {
        countryCode: String(data.country_code).toUpperCase(),
        countryName: String(data.country),
      };
    }
  } catch {
    /* try next */
  }
  return null;
}

export async function detectCountryFromIP(ip: string): Promise<GeoResult | null> {
  try {
    if (isNonRoutableClientIpForGeo(ip)) {
      return null;
    }
    const cleanIp = ip.replace(/^::ffff:/i, "").trim();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(
      `https://api.bigdatacloud.net/data/ip-geolocation?ip=${encodeURIComponent(cleanIp)}&localityLanguage=en&key=bdc_4422d41470b04a2eb0c50959ae1b8da0`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);

    if (!res.ok) {
      const fallbackRes = await fetch(
        `https://ipapi.co/${encodeURIComponent(cleanIp)}/json/`,
        { signal: AbortSignal.timeout(5000) }
      );
      if (fallbackRes.ok) {
        const data = await fallbackRes.json();
        if (data.country_code && data.country_name) {
          return { countryCode: data.country_code, countryName: data.country_name };
        }
      }
      return geoFromIpWhoIs(cleanIp);
    }

    const data = await res.json();
    if (data.country?.isoAlpha2 && data.country?.name) {
      return {
        countryCode: data.country.isoAlpha2,
        countryName: data.country.name,
      };
    }

    const fromIpWho = await geoFromIpWhoIs(cleanIp);
    if (fromIpWho) return fromIpWho;

    return null;
  } catch (error: any) {
    log(`Geo detection failed for IP ${ip}: ${error.message}`, "geo");
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
