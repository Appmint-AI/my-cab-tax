import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  RefreshCw, Shield, TrendingUp, Lock, AlertTriangle,
  ArrowRightLeft, Loader2, Activity, DollarSign, Anchor
} from "lucide-react";

const CURRENCIES = [
  "USD", "EUR", "GBP", "PKR", "AED", "SAR", "VND", "INR", "BDT", "NGN", "KES",
  "ZAR", "BRL", "MXN", "PHP", "EGP", "TRY", "ARS", "LBP", "VES",
];

export default function CurrencyPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [convertFrom, setConvertFrom] = useState("PKR");
  const [convertTo, setConvertTo] = useState("USD");
  const [convertAmount, setConvertAmount] = useState("1000");
  const [conversionResult, setConversionResult] = useState<any>(null);

  const statusQuery = useQuery<any>({
    queryKey: ["/api/currency/status"],
  });

  const ratesQuery = useQuery<any[]>({
    queryKey: ["/api/currency/rates"],
  });

  const locksQuery = useQuery<any[]>({
    queryKey: ["/api/currency/vault-locks"],
  });

  const syncMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/currency/sync"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/currency/rates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/currency/status"] });
      toast({ title: "Forex rates synced" });
    },
  });

  const convertMutation = useMutation({
    mutationFn: (data: { amount: number; from: string; to: string }) =>
      apiRequest("POST", "/api/currency/convert", data),
    onSuccess: async (res) => {
      const data = await res.json();
      setConversionResult(data);
    },
    onError: () => {
      toast({ title: "Conversion failed", variant: "destructive" });
    },
  });

  const handleConvert = () => {
    const amt = parseFloat(convertAmount);
    if (!amt || amt <= 0) return;
    convertMutation.mutate({ amount: amt, from: convertFrom, to: convertTo });
  };

  const [anchorCurrency, setAnchorCurrency] = useState("PKR");

  const anchorStatusQuery = useQuery<any>({
    queryKey: ["/api/anchor/status"],
  });

  const anchorMutation = useMutation({
    mutationFn: (currency: string) => apiRequest("POST", "/api/anchor/run", { currency }),
    onSuccess: async (res) => {
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/anchor/status"] });
      toast({ title: "Anchoring Complete", description: `${data.anchored} transactions anchored to USD` });
    },
    onError: () => {
      toast({ title: "Anchoring Failed", variant: "destructive" });
    },
  });

  const status = statusQuery.data;
  const rates = ratesQuery.data || [];
  const locks = locksQuery.data || [];
  const anchorStatus = anchorStatusQuery.data;

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-currency-title">
            <Shield className="h-6 w-6 text-primary" />
            {t("currency.title")}
          </h1>
          <p className="text-muted-foreground mt-1" data-testid="text-currency-subtitle">
            {t("currency.subtitle")}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <Activity className="h-6 w-6 mx-auto text-green-500 mb-2" />
              <p className="text-2xl font-bold" data-testid="text-rates-count">
                {status?.ratesAvailable || 0}
              </p>
              <p className="text-xs text-muted-foreground">{t("currency.ratesAvailable")}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <Lock className="h-6 w-6 mx-auto text-blue-500 mb-2" />
              <p className="text-2xl font-bold" data-testid="text-locked-count">
                {status?.lockedTransactions || 0}
              </p>
              <p className="text-xs text-muted-foreground">{t("currency.lockedTransactions")}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <AlertTriangle className="h-6 w-6 mx-auto text-amber-500 mb-2" />
              <p className="text-2xl font-bold" data-testid="text-warnings-count">
                {status?.volatileWarnings?.length || 0}
              </p>
              <p className="text-xs text-muted-foreground">{t("currency.volatileWarnings")}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <RefreshCw className="h-6 w-6 mx-auto text-purple-500 mb-2" />
              <p className="text-sm font-medium" data-testid="text-last-sync">
                {status?.lastSync
                  ? new Date(status.lastSync).toLocaleTimeString()
                  : "—"}
              </p>
              <p className="text-xs text-muted-foreground">{t("currency.lastSync")}</p>
            </CardContent>
          </Card>
        </div>

        {status?.volatileWarnings?.length > 0 && (
          <Card className="border-amber-300 dark:border-amber-700">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  {status.volatileWarnings.map((w: string, i: number) => (
                    <p key={i} className="text-sm text-amber-700 dark:text-amber-300" data-testid={`text-warning-${i}`}>
                      {w}
                    </p>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="border-blue-200 dark:border-blue-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Anchor className="h-5 w-5 text-blue-500" />
              Stable USD Anchor
            </CardTitle>
            <CardDescription>
              Convert all local currency entries to their USD equivalent using today's exchange rate
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-3 items-end">
              <div className="flex-1">
                <label className="text-xs text-muted-foreground mb-1 block">Source Currency</label>
                <Select value={anchorCurrency} onValueChange={setAnchorCurrency}>
                  <SelectTrigger data-testid="select-anchor-currency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.filter(c => c !== "USD").map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={() => anchorMutation.mutate(anchorCurrency)}
                disabled={anchorMutation.isPending}
                data-testid="button-anchor-run"
              >
                {anchorMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <Anchor className="h-4 w-4 mr-1" />
                )}
                Anchor to USD
              </Button>
            </div>
            {anchorStatus && (
              <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-center">
                <div className="p-2 bg-muted/50 rounded">
                  <p className="text-lg font-bold" data-testid="text-anchor-expenses">{anchorStatus.anchoredExpenses}/{anchorStatus.totalExpenses}</p>
                  <p className="text-[10px] text-muted-foreground">Expenses Anchored</p>
                </div>
                <div className="p-2 bg-muted/50 rounded">
                  <p className="text-lg font-bold" data-testid="text-anchor-incomes">{anchorStatus.anchoredIncomes}/{anchorStatus.totalIncomes}</p>
                  <p className="text-[10px] text-muted-foreground">Incomes Anchored</p>
                </div>
                <div className="p-2 bg-muted/50 rounded col-span-2">
                  <p className="text-lg font-bold" data-testid="text-anchor-pending">{anchorStatus.unanchoredCount}</p>
                  <p className="text-[10px] text-muted-foreground">Pending Anchor</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ArrowRightLeft className="h-5 w-5" />
                {t("currency.converter")}
              </CardTitle>
              <CardDescription>{t("currency.vaultLockDesc")}</CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending}
              data-testid="button-sync-rates"
            >
              {syncMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-1" />
              )}
              {syncMutation.isPending ? t("currency.syncing") : t("currency.syncNow")}
            </Button>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-3 items-end">
              <div className="flex-1">
                <label className="text-xs text-muted-foreground mb-1 block">{t("currency.amount")}</label>
                <Input
                  type="number"
                  value={convertAmount}
                  onChange={(e) => setConvertAmount(e.target.value)}
                  placeholder="1000"
                  data-testid="input-convert-amount"
                />
              </div>
              <div className="w-28">
                <label className="text-xs text-muted-foreground mb-1 block">{t("currency.from")}</label>
                <Select value={convertFrom} onValueChange={setConvertFrom}>
                  <SelectTrigger data-testid="select-convert-from">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <ArrowRightLeft className="h-5 w-5 text-muted-foreground shrink-0 hidden sm:block" />
              <div className="w-28">
                <label className="text-xs text-muted-foreground mb-1 block">{t("currency.to")}</label>
                <Select value={convertTo} onValueChange={setConvertTo}>
                  <SelectTrigger data-testid="select-convert-to">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={handleConvert}
                disabled={convertMutation.isPending}
                data-testid="button-convert"
              >
                {convertMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  t("currency.convert")
                )}
              </Button>
            </div>

            {conversionResult && (
              <div className="mt-4 p-4 bg-muted/50 rounded-lg space-y-2" data-testid="div-conversion-result">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">{t("currency.result")}</span>
                  <span className="text-xl font-bold font-mono" data-testid="text-conversion-amount">
                    {conversionResult.converted?.toFixed(2)} {conversionResult.to}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">1 {conversionResult.from}</span>
                  <span className="font-mono">{conversionResult.rate?.toFixed(6)} {conversionResult.to}</span>
                </div>
                {conversionResult.benchmark && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{t("currency.stabilityIndex")}</span>
                    <Badge
                      variant={conversionResult.benchmark.stabilityIndex > 80 ? "secondary" : "destructive"}
                      data-testid="badge-stability"
                    >
                      {conversionResult.benchmark.stabilityIndex}%
                    </Badge>
                  </div>
                )}
                {conversionResult.inflationWarning && (
                  <div className="flex items-start gap-2 mt-2 p-2 bg-amber-50 dark:bg-amber-950/30 rounded text-sm">
                    <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                    <span className="text-amber-700 dark:text-amber-300" data-testid="text-inflation-warning">
                      {conversionResult.inflationWarning}
                    </span>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              {t("currency.liveRates")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {rates.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4" data-testid="text-no-rates">
                {t("currency.noRates")}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="p-2 font-medium">Currency</th>
                      <th className="p-2 font-medium">Rate (vs USD)</th>
                      <th className="p-2 font-medium">Volatility</th>
                      <th className="p-2 font-medium">{t("currency.lastSync")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rates.filter(r => r.targetCurrency !== "XAU").map((rate: any) => (
                      <tr key={rate.id} className="border-b last:border-0 hover:bg-muted/50" data-testid={`row-rate-${rate.targetCurrency}`}>
                        <td className="p-2 font-medium">{rate.targetCurrency}</td>
                        <td className="p-2 font-mono">{parseFloat(rate.rate).toFixed(4)}</td>
                        <td className="p-2">
                          {rate.volatilityPct ? (
                            <Badge
                              variant={parseFloat(rate.volatilityPct) > 5 ? "destructive" : "secondary"}
                            >
                              {parseFloat(rate.volatilityPct).toFixed(2)}%
                            </Badge>
                          ) : (
                            <Badge variant="outline">—</Badge>
                          )}
                        </td>
                        <td className="p-2 text-muted-foreground">
                          {new Date(rate.fetchedAt).toLocaleTimeString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              {t("currency.lockedTransactions")}
            </CardTitle>
            <CardDescription>{t("currency.vaultLockDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            {locks.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4" data-testid="text-no-locks">
                {t("currency.vaultEmpty")}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="p-2 font-medium">Type</th>
                      <th className="p-2 font-medium">{t("currency.originalAmount")}</th>
                      <th className="p-2 font-medium">{t("currency.lockedRate")}</th>
                      <th className="p-2 font-medium">{t("currency.usdEquivalent")}</th>
                      <th className="p-2 font-medium">{t("common.date")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {locks.map((lock: any) => (
                      <tr key={lock.id} className="border-b last:border-0" data-testid={`row-lock-${lock.id}`}>
                        <td className="p-2">
                          <Badge variant="outline">{lock.entityType}</Badge>
                        </td>
                        <td className="p-2 font-mono">
                          {parseFloat(lock.originalAmount).toFixed(2)} {lock.originalCurrency}
                        </td>
                        <td className="p-2 font-mono">{parseFloat(lock.lockedRate).toFixed(6)}</td>
                        <td className="p-2 font-mono font-medium">
                          <DollarSign className="h-3 w-3 inline" />
                          {parseFloat(lock.usdAmount).toFixed(2)}
                        </td>
                        <td className="p-2 text-muted-foreground">
                          {new Date(lock.lockedAt).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
