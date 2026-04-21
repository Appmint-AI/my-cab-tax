import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useSearch } from "wouter";
import confetti from "canvas-confetti";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Shield,
  Car,
  Briefcase,
  TrendingUp,
  CheckCircle,
  AlertTriangle,
  Rocket,
  Lock,
  Loader2,
  FileText,
  Sparkles,
  CreditCard,
  PartyPopper,
  XCircle,
} from "lucide-react";
import { SiStripe } from "react-icons/si";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useRegion } from "@/hooks/use-region";

interface IncomeSource {
  label: string;
  amount: number;
  status: string;
  icon: string;
}

interface TaxOverviewData {
  taxYear: string;
  incomeSources: IncomeSource[];
  totalGrossIncome: number;
  totalExpenses: number;
  netBusinessProfit: number;
  personalAllowance: number;
  taxableIncome: number;
  estimatedTax: number;
  taxAlreadyPaid: number;
  balanceDue: number;
  declaration: {
    id: number;
    status: string;
    paidAt: string | null;
    submittedAt: string | null;
    hmrcSubmissionId: string | null;
  } | null;
}

function formatGBP(amount: number): string {
  return `\u00A3${Math.abs(amount).toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function formatUSD(amount: number): string {
  return `$${Math.abs(amount).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function IncomeIcon({ type }: { type: string }) {
  switch (type) {
    case "taxi": return <Car className="h-5 w-5" />;
    case "briefcase": return <Briefcase className="h-5 w-5" />;
    case "trending-up": return <TrendingUp className="h-5 w-5" />;
    default: return <CreditCard className="h-5 w-5" />;
  }
}

function StatusBadge({ status }: { status: string }) {
  if (status === "Synced") return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800" data-testid="badge-synced"><CheckCircle className="h-3 w-3 mr-1" />Synced</Badge>;
  if (status === "Manual Entry") return <Badge variant="secondary" data-testid="badge-manual">Manual Entry</Badge>;
  return <Badge variant="outline" className="text-muted-foreground" data-testid="badge-not-added">Not Added</Badge>;
}

export default function TaxOverviewPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { isUS, isUK, formatCurrency } = useRegion();
  const searchParams = useSearch();
  const params = new URLSearchParams(searchParams);
  const declarationSuccess = params.get("declaration") === "success";
  const declarationCancelled = params.get("declaration") === "cancelled";

  const [selectedTaxYear, setSelectedTaxYear] = useState(isUS ? "2026" : "2026/27");
  const [showOtherIncome, setShowOtherIncome] = useState(false);
  const [payeInput, setPayeInput] = useState("");
  const [dividendInput, setDividendInput] = useState("");
  const [successDismissed, setSuccessDismissed] = useState(false);
  const [cancelledDismissed, setCancelledDismissed] = useState(false);

  useEffect(() => {
    if (declarationSuccess && !successDismissed) {
      const duration = 3000;
      const end = Date.now() + duration;
      const frame = () => {
        confetti({ particleCount: 3, angle: 60, spread: 55, origin: { x: 0 } });
        confetti({ particleCount: 3, angle: 120, spread: 55, origin: { x: 1 } });
        if (Date.now() < end) requestAnimationFrame(frame);
      };
      frame();
    }
  }, [declarationSuccess, successDismissed]);

  const { data: overview, isLoading } = useQuery<TaxOverviewData>({
    queryKey: ["/api/tax-overview", selectedTaxYear],
    queryFn: async () => {
      const res = await fetch(`/api/tax-overview?taxYear=${encodeURIComponent(selectedTaxYear)}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load tax overview");
      return res.json();
    },
  });

  const saveOtherIncome = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/tax-overview/other-income", {
        taxYear: selectedTaxYear,
        payeIncome: Number(payeInput) || 0,
        dividendIncome: Number(dividendInput) || 0,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tax-overview", selectedTaxYear] });
      setShowOtherIncome(false);
      toast({ title: "Other income saved", description: "Tax calculations updated." });
    },
  });

  const checkoutMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/final-declaration/checkout", { taxYear: selectedTaxYear });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.url) window.location.href = data.url;
    },
    onError: (err: any) => {
      toast({ title: "Payment Error", description: err.message, variant: "destructive" });
    },
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/final-declaration/submit", { taxYear: selectedTaxYear });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tax-overview", selectedTaxYear] });
      toast({
        title: isUS ? "Annual 1040 Prep Submitted" : "Final Declaration Submitted",
        description: `${isUS ? "IRS" : "HMRC"} Submission ID: ${data.hmrcSubmissionId}`,
      });
      const duration = 3000;
      const end = Date.now() + duration;
      const frame = () => {
        confetti({ particleCount: 3, angle: 60, spread: 55, origin: { x: 0 } });
        confetti({ particleCount: 3, angle: 120, spread: 55, origin: { x: 1 } });
        if (Date.now() < end) requestAnimationFrame(frame);
      };
      frame();
    },
    onError: (err: any) => {
      toast({ title: "Submission Error", description: err.message, variant: "destructive" });
    },
  });

  const isPaid = overview?.declaration?.status === "paid";
  const isSubmitted = overview?.declaration?.status === "submitted";

  return (
    <Layout>
      <div className="space-y-6" data-testid="tax-overview-page">
        {declarationSuccess && !successDismissed && (
          <Card className="border-emerald-300/50 bg-emerald-50/50 dark:bg-emerald-950/20 dark:border-emerald-800/30" data-testid="banner-declaration-success">
            <CardContent className="p-4 flex items-start gap-3">
              <PartyPopper className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">Payment Confirmed</p>
                <p className="text-xs text-emerald-700/80 dark:text-emerald-400/70">Your Final Declaration is unlocked. Review your summary and submit when ready.</p>
              </div>
              <button onClick={() => setSuccessDismissed(true)} className="text-emerald-600/60 hover:text-emerald-600" data-testid="button-dismiss-success">
                <XCircle className="h-4 w-4" />
              </button>
            </CardContent>
          </Card>
        )}

        {declarationCancelled && !cancelledDismissed && (
          <Card className="border-amber-300/50 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-800/30" data-testid="banner-declaration-cancelled">
            <CardContent className="p-4 flex items-start gap-3">
              <XCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Payment Cancelled</p>
                <p className="text-xs text-amber-700/80 dark:text-amber-400/70">No charges were made. You can unlock your Final Declaration whenever you're ready.</p>
              </div>
              <button onClick={() => setCancelledDismissed(true)} data-testid="button-dismiss-cancelled">
                <XCircle className="h-4 w-4 text-amber-600/60 hover:text-amber-600" />
              </button>
            </CardContent>
          </Card>
        )}

        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-tax-overview-title">
              <Shield className="h-6 w-6 text-primary" />
              Tax Year {selectedTaxYear} Summary
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {isUS
                ? "Estimated balance based on federal + state tax brackets. Updates in real-time as you scan receipts."
                : "Estimated balance based on England/Wales/NI tax bands. Updates in real-time as you scan receipts."}
            </p>
          </div>
          <Select value={selectedTaxYear} onValueChange={setSelectedTaxYear}>
            <SelectTrigger className="w-36" data-testid="select-tax-year">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={isUS ? "2025" : "2025/26"}>{isUS ? "2025" : "2025/26"}</SelectItem>
              <SelectItem value={isUS ? "2026" : "2026/27"}>{isUS ? "2026" : "2026/27"}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : overview ? (
          <>
            <Card data-testid="card-income-sources">
              <CardHeader>
                <CardTitle className="text-base">Income Sources</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-0.5">
                  <div className="grid grid-cols-12 text-xs font-medium text-muted-foreground pb-2 border-b">
                    <span className="col-span-1"></span>
                    <span className="col-span-5">Source</span>
                    <span className="col-span-3 text-right">Amount</span>
                    <span className="col-span-3 text-right">Status</span>
                  </div>
                  {overview.incomeSources.map((src, i) => (
                    <div key={i} className="grid grid-cols-12 items-center py-3 border-b border-muted/30 last:border-0" data-testid={`row-income-${i}`}>
                      <div className="col-span-1 text-muted-foreground">
                        <IncomeIcon type={src.icon} />
                      </div>
                      <span className="col-span-5 text-sm font-medium">{src.label}</span>
                      <span className="col-span-3 text-right text-sm font-semibold">{formatGBP(src.amount)}</span>
                      <div className="col-span-3 flex justify-end">
                        <StatusBadge status={src.status} />
                      </div>
                    </div>
                  ))}
                  <div className="grid grid-cols-12 items-center pt-3">
                    <div className="col-span-1"></div>
                    <span className="col-span-5 text-sm font-bold">Total Gross Income</span>
                    <span className="col-span-3 text-right text-base font-bold" data-testid="text-total-gross">{formatGBP(overview.totalGrossIncome)}</span>
                    <div className="col-span-3"></div>
                  </div>
                </div>

                {!showOtherIncome && (
                  <Button variant="outline" size="sm" className="mt-4" onClick={() => {
                    const paye = overview.incomeSources.find(s => s.icon === "briefcase");
                    const div = overview.incomeSources.find(s => s.icon === "trending-up");
                    setPayeInput(paye && paye.amount > 0 ? String(paye.amount) : "");
                    setDividendInput(div && div.amount > 0 ? String(div.amount) : "");
                    setShowOtherIncome(true);
                  }} data-testid="button-add-other-income">
                    <Briefcase className="h-3.5 w-3.5 mr-1.5" />
                    Add PAYE / Dividend Income
                  </Button>
                )}

                {showOtherIncome && (
                  <div className="mt-4 p-4 rounded-lg border bg-muted/30 space-y-3" data-testid="form-other-income">
                    <p className="text-sm font-medium">Other Income (Manual Entry)</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">PAYE Employment Income (£)</label>
                        <Input type="number" placeholder="0" value={payeInput} onChange={(e) => setPayeInput(e.target.value)} data-testid="input-paye" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">Dividends / Savings (£)</label>
                        <Input type="number" placeholder="0" value={dividendInput} onChange={(e) => setDividendInput(e.target.value)} data-testid="input-dividends" />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => saveOtherIncome.mutate()} disabled={saveOtherIncome.isPending} data-testid="button-save-other-income">
                        {saveOtherIncome.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                        Save
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setShowOtherIncome(false)} data-testid="button-cancel-other-income">Cancel</Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card data-testid="card-tax-breakdown">
              <CardHeader>
                <CardTitle className="text-base">Tax Breakdown</CardTitle>
                <CardDescription>{isUS ? "2026 Federal + State tax brackets applied" : "2026/27 England/Wales/NI tax bands applied"}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-0.5">
                  {[
                    { label: "Personal Allowance", amount: -overview.personalAllowance, isDeduction: true },
                    { label: "Taxable Income", amount: overview.taxableIncome, isBold: true },
                    { label: "Estimated Tax (banded)", amount: overview.estimatedTax, isTax: true },
                    { label: "Tax Already Paid (PAYE)", amount: -overview.taxAlreadyPaid, isDeduction: true },
                  ].map((row, i) => (
                    <div key={i} className={`flex items-center justify-between py-3 ${i < 3 ? "border-b border-muted/30" : ""}`} data-testid={`row-tax-${i}`}>
                      <span className={`text-sm ${row.isBold ? "font-bold" : ""}`}>{row.label}</span>
                      <span className={`text-sm font-semibold ${row.isDeduction ? "text-emerald-600 dark:text-emerald-400" : ""} ${row.isTax ? "text-destructive" : ""} ${row.isBold ? "font-bold text-base" : ""}`}>
                        {row.isDeduction ? `-${formatGBP(Math.abs(row.amount))}` : formatGBP(row.amount)}
                      </span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between pt-4 border-t-2 border-primary/30">
                    <span className="text-base font-bold">Remaining Balance Due</span>
                    <span className={`text-xl font-bold ${overview.balanceDue > 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"}`} data-testid="text-balance-due">
                      {formatGBP(overview.balanceDue)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className={`border-2 ${isSubmitted ? "border-emerald-300 dark:border-emerald-800" : isPaid ? "border-primary/30" : "border-primary/20"}`} data-testid="card-final-declaration">
              <CardContent className="p-6 sm:p-8">
                {isSubmitted ? (
                  <div className="text-center space-y-4">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 mx-auto">
                      <CheckCircle className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <h2 className="text-2xl font-bold" data-testid="text-declaration-submitted">Tax Year Sealed</h2>
                    <p className="text-muted-foreground max-w-md mx-auto">
                      {isUS
                        ? `Your Annual 1040 Prep for ${selectedTaxYear} has been submitted to the IRS.`
                        : `Your Final Declaration for ${selectedTaxYear} has been submitted to HMRC.`}
                    </p>
                    <div className="p-4 rounded-lg bg-muted/50 max-w-sm mx-auto">
                      <p className="text-xs text-muted-foreground mb-1">{isUS ? "IRS Submission ID" : "HMRC Submission ID"}</p>
                      <p className="font-mono font-bold text-lg" data-testid="text-hmrc-id">{overview.declaration?.hmrcSubmissionId}</p>
                    </div>
                    <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                      <Shield className="h-3 w-3 mr-1" />
                      Tax Year Certificate Issued
                    </Badge>
                  </div>
                ) : isPaid ? (
                  <div className="text-center space-y-4">
                    <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 mx-auto">
                      <FileText className="h-7 w-7 text-primary" />
                    </div>
                    <h2 className="text-2xl font-bold" data-testid="text-declaration-ready">Ready to Submit</h2>
                    <p className="text-muted-foreground max-w-lg mx-auto">
                      Your Final Declaration is unlocked. Review your tax summary above, then submit to HMRC.
                    </p>
                    <Button
                      size="lg"
                      className="min-w-[200px]"
                      onClick={() => submitMutation.mutate()}
                      disabled={submitMutation.isPending}
                      data-testid="button-submit-declaration"
                    >
                      {submitMutation.isPending ? (
                        <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                      ) : (
                        <Rocket className="h-5 w-5 mr-2" />
                      )}
                      {isUS ? "Submit to IRS" : "Submit to HMRC"}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="text-center">
                      <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 mx-auto mb-4">
                        <Shield className="h-7 w-7 text-primary" />
                      </div>
                      <h2 className="text-2xl sm:text-3xl font-bold mb-2" data-testid="text-declaration-title">
                        {isUS ? "Annual 1040 Prep: Seal Your Tax Year" : "The Final Declaration: Seal Your Tax Year"}
                      </h2>
                      <p className="text-muted-foreground max-w-lg mx-auto leading-relaxed">
                        {isUS
                          ? "Your quarterly estimated payments kept you on track with the IRS. Now, it's time for the Annual 1040 Prep — the comprehensive return that officially closes your tax year."
                          : "Your 4 Quarterly Updates provided HMRC with a \"Live Feed\" of your driving business. Now, it's time for the Final Declaration — the legal submission that officially replaces your Self-Assessment."}
                      </p>
                    </div>

                    <div className="max-w-lg mx-auto space-y-3">
                      <h3 className="text-sm font-semibold text-center">{isUS ? "What's Included for $35:" : "What's Included for \u00A329:"}</h3>
                      {(isUS ? [
                        { icon: CreditCard, title: "Income Consolidation", desc: "We pull in your 1099-K, W-2 wages, and other income sources." },
                        { icon: Sparkles, title: "Deduction Optimization", desc: "We automatically apply the Standard Deduction ($15,700) and Schedule C business deductions." },
                        { icon: Shield, title: "Error Shield", desc: "AI-powered cross-check of your quarterly filings to catch any double-entries or missed expenses." },
                        { icon: FileText, title: "Legal Receipt", desc: "An official IRS submission ID and a \"Tax Year Certificate\" for your records." },
                      ] : [
                        { icon: CreditCard, title: "Income Consolidation", desc: "We pull in your PAYE employment, pensions, and dividends." },
                        { icon: Sparkles, title: "Allowance Optimisation", desc: "We automatically apply your \u00A312,570 Personal Allowance and any relevant tax reliefs." },
                        { icon: Shield, title: "Error Shield", desc: "AI-powered cross-check of your 4 quarters to catch any double-entries or missed expenses." },
                        { icon: FileText, title: "Legal Receipt", desc: "An official HMRC submission ID and a \"Tax Year Certificate\" for your records." },
                      ]).map(({ icon: Icon, title, desc }) => (
                        <div key={title} className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
                          <div className="p-2 rounded-lg bg-primary/10 shrink-0">
                            <Icon className="h-4 w-4 text-primary" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold">{title}</p>
                            <p className="text-xs text-muted-foreground">{desc}</p>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="text-center space-y-3 pt-2">
                      <Button
                        size="lg"
                        className="h-12 text-base font-semibold min-w-[280px]"
                        onClick={() => checkoutMutation.mutate()}
                        disabled={checkoutMutation.isPending}
                        data-testid="button-unlock-declaration"
                      >
                        {checkoutMutation.isPending ? (
                          <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                        ) : (
                          <Rocket className="h-5 w-5 mr-2" />
                        )}
                        {isUS ? "Unlock Annual 1040 Prep — $35.00" : "Unlock Final Filing — \u00A329.00"}
                      </Button>
                      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                        <Lock className="h-3.5 w-3.5" />
                        <span>Powered by</span>
                        <SiStripe className="h-8 w-auto text-[#635BFF] dark:text-[#A39BFF]" />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        One-time payment. You will be redirected to Stripe to finalise.
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>
    </Layout>
  );
}
