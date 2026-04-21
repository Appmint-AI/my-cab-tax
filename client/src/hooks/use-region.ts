import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./use-auth";
import { apiRequest } from "@/lib/queryClient";

export type RegionType = "US" | "UK" | "CA" | "MX" | "NO" | "SE" | "DK" | "EU" | "MY" | "CN" | "ID" | "BR" | "ZA" | "NG" | "OTHER";

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

const DEFAULT_US_CONFIG: RegionConfig = {
  region: "US",
  currency: "USD",
  currencySymbol: "$",
  locale: "en-US",
  taxModules: {
    showScheduleC: true,
    showEstimatedTax: true,
    showSelfEmploymentTax: true,
    showMTDQuarterly: false,
    showUniversalCredit: false,
    showFinalDeclaration: false,
    showTaxOverview: false,
  },
};

export function useRegion() {
  const { user, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  const { data: regionConfig } = useQuery<RegionConfig>({
    queryKey: ["/api/user/region-config"],
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 30,
  });

  const switchRegionMutation = useMutation({
    mutationFn: async (countryCode: string) => {
      const res = await apiRequest("PATCH", "/api/user/detected-country", { countryCode });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/region-config"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    },
  });

  const config = regionConfig || DEFAULT_US_CONFIG;

  const formatCurrency = (amount: number): string => {
    try {
      return new Intl.NumberFormat(config.locale, {
        style: "currency",
        currency: config.currency,
      }).format(amount);
    } catch {
      return `${config.currencySymbol}${amount.toFixed(2)}`;
    }
  };

  const isUK = config.region === "UK";
  const isUS = config.region === "US";
  const isCA = config.region === "CA";
  const isMX = config.region === "MX";
  const isScandinavia = ["NO", "SE", "DK"].includes(config.region);
  const isEU = config.region === "EU";
  const isAsia = ["MY", "CN", "ID"].includes(config.region);
  const isSouthAmerica = config.region === "BR";
  const isAfrica = ["ZA", "NG"].includes(config.region);

  const regionFlag: Record<string, string> = {
    US: "🇺🇸", UK: "🇬🇧", CA: "🇨🇦", MX: "🇲🇽",
    NO: "🇳🇴", SE: "🇸🇪", DK: "🇩🇰", EU: "🇪🇺",
    MY: "🇲🇾", CN: "🇨🇳", ID: "🇮🇩",
    BR: "🇧🇷", ZA: "🇿🇦", NG: "🇳🇬", OTHER: "🌍",
  };

  return {
    ...config,
    isUK,
    isUS,
    isCA,
    isMX,
    isScandinavia,
    isEU,
    isAsia,
    isSouthAmerica,
    isAfrica,
    flag: regionFlag[config.region] || "🌍",
    formatCurrency,
    switchRegion: switchRegionMutation.mutate,
    isSwitching: switchRegionMutation.isPending,
    detectedCountry: user?.detectedCountry || null,
  };
}
