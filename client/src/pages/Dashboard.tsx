import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Layout } from "@/components/Layout";
import { useTaxSummary } from "@/hooks/use-tax";
import { useAuth } from "@/hooks/use-auth";
import { useRegion } from "@/hooks/use-region";
import { IncomeForm } from "@/components/forms/IncomeForm";
import { ExpenseForm } from "@/components/forms/ExpenseForm";
import { Form1099K } from "@/components/forms/Form1099K";
import { AutoGrossForm } from "@/components/forms/AutoGrossForm";
import { ReceiptCapture } from "@/components/ReceiptCapture";
import { StatementParser } from "@/components/StatementParser";
import { DashboardCharts } from "@/components/DashboardCharts";
import { ProfitabilityHeatmap } from "@/components/ProfitabilityHeatmap";
import { useMileageLogs } from "@/hooks/use-mileage-logs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { DollarSign, Wallet, TrendingDown, FileText, Car, Calendar, Download, AlertTriangle, Shield, Clock, Loader2, Info, Send, CheckCircle2, XCircle, Lock, Gauge, MapPin, Bell, Radio, X, RefreshCw, ExternalLink, Lightbulb, Wrench, Target, TrendingUp, AlertCircle } from "lucide-react";
import { motion } from "framer-motion";
import { format, parseISO, differenceInDays } from "date-fns";
import { Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import JSZip from "jszip";
import { jsPDF } from "jspdf";
import { IRS_MILEAGE_RATE, STANDARD_DEDUCTION_2026 } from "@shared/schema";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { TaxSummary, MileageLog } from "@shared/schema";
import { SubmissionSuccess } from "@/components/SubmissionSuccess";
import { useLocation } from "wouter";
import type { User } from "@shared/models/auth";
import { getSegmentConfig } from "@/lib/segment-config";

const IRS_1099K_THRESHOLD = 20000;
const IRS_1099K_TRANSACTIONS = 200;

function SmallEarnerGate({ grossIncome }: { grossIncome: number }) {
  const isAboveThreshold = grossIncome >= IRS_1099K_THRESHOLD;

  return (
    <Card className="mt-6 border-blue-200/60 dark:border-blue-800/40 bg-blue-50/30 dark:bg-blue-950/20 shadow-sm" data-testid="card-1099k-gate">
      <CardContent className="flex items-start gap-3 py-3 px-4">
        <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-blue-900 dark:text-blue-200">
              2026 IRS Update: 1099-K Reporting
            </p>
            {isAboveThreshold ? (
              <Badge variant="destructive" className="text-[10px] no-default-active-elevate" data-testid="badge-1099k-above">
                Threshold Exceeded
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] border-green-400 text-green-700 dark:text-green-300 no-default-active-elevate" data-testid="badge-1099k-below">
                Below Threshold
              </Badge>
            )}
          </div>
          {isAboveThreshold ? (
            <p className="text-xs text-blue-800/70 dark:text-blue-300/70 mt-1 leading-relaxed">
              Your gross income (${grossIncome.toLocaleString()}) exceeds the 2026 reporting threshold of ${IRS_1099K_THRESHOLD.toLocaleString()}. Platforms must issue a 1099-K when gross payments exceed ${IRS_1099K_THRESHOLD.toLocaleString()} AND exceed {IRS_1099K_TRANSACTIONS} transactions. Report the GROSS amount from Box 1a, even if it differs from your bank deposits. Use "Add 1099-K" to enter your details.
            </p>
          ) : (
            <p className="text-xs text-blue-800/70 dark:text-blue-300/70 mt-1 leading-relaxed">
              Your gross income (${grossIncome.toLocaleString()}) is below the 2026 gross threshold of ${IRS_1099K_THRESHOLD.toLocaleString()}. A 1099-K is required only when BOTH the ${IRS_1099K_THRESHOLD.toLocaleString()} gross AND {IRS_1099K_TRANSACTIONS}+ transaction thresholds are met. You must still report all income on Schedule C regardless of whether a 1099-K is issued.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function QuarterlyEstimatedTaxCalculator({ summary, user }: { summary: TaxSummary; user: User | null | undefined }) {
  const today = new Date();
  const currentMonth = today.getMonth();
  const currentQuarter = Math.floor(currentMonth / 3) + 1;
  const { formatCurrency } = useRegion();

  const netProfit = Math.max(0, summary.netProfit);
  const annualSETax = summary.selfEmploymentTax;
  const seDeduction = summary.seDeduction;
  const tipExemption = summary.tipExemption || 0;
  const agi = netProfit - seDeduction - tipExemption;
  const standardDeduction = STANDARD_DEDUCTION_2026;
  const taxableIncome = Math.max(0, agi - standardDeduction);

  const federalTaxBrackets2026 = [
    { min: 0, max: 11600, rate: 0.10 },
    { min: 11600, max: 47150, rate: 0.12 },
    { min: 47150, max: 100525, rate: 0.22 },
    { min: 100525, max: 191950, rate: 0.24 },
    { min: 191950, max: 243725, rate: 0.32 },
    { min: 243725, max: 609350, rate: 0.35 },
    { min: 609350, max: Infinity, rate: 0.37 },
  ];

  let federalIncomeTax = 0;
  let remaining = taxableIncome;
  for (const bracket of federalTaxBrackets2026) {
    const taxable = Math.min(remaining, bracket.max - bracket.min);
    if (taxable <= 0) break;
    federalIncomeTax += taxable * bracket.rate;
    remaining -= taxable;
  }

  const userState = user?.stateCode || null;
  const { data: stateEstimate } = useQuery<any>({
    queryKey: ["/api/tax/state-estimate", userState, netProfit],
    queryFn: async () => {
      if (!userState) return null;
      const res = await fetch(`/api/tax/state-estimate?stateCode=${userState}&netProfit=${netProfit}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!userState,
    staleTime: 1000 * 60 * 5,
  });

  const stateTax = stateEstimate?.taxOwed || 0;
  const totalAnnualTax = federalIncomeTax + annualSETax + stateTax;
  const quarterlyPayment = totalAnnualTax / 4;
  const effectiveRate = netProfit > 0 ? (totalAnnualTax / netProfit) * 100 : 0;

  const quarterLabels = ["Q1", "Q2", "Q3", "Q4"];
  const deadlines = summary.quarterlyDeadlines;

  const worksheetRows = [
    { label: "1. Net Profit (Schedule C, Line 31)", value: netProfit, testId: "text-calc-net-profit" },
    { label: "2. SE Tax (15.3% × 92.35%)", value: annualSETax, testId: "text-calc-se-tax" },
    { label: "3. SE Deduction (50% of Line 2)", value: seDeduction, testId: "text-calc-se-deduction", negative: true },
    ...(tipExemption > 0 ? [{ label: "4. Tip Exemption (OBBBA)", value: tipExemption, testId: "text-calc-tip-exempt", negative: true }] : []),
    { label: `${tipExemption > 0 ? "5" : "4"}. Adjusted Gross Income`, value: agi, testId: "text-calc-agi" },
    { label: `${tipExemption > 0 ? "6" : "5"}. Standard Deduction`, value: standardDeduction, testId: "text-calc-std-deduction", negative: true },
    { label: `${tipExemption > 0 ? "7" : "6"}. Taxable Income`, value: taxableIncome, testId: "text-calc-taxable-income", highlight: true },
  ];

  return (
    <Card className="mt-6 border-border/60 shadow-sm" data-testid="card-quarterly-calculator">
      <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
        <CardTitle className="text-base font-medium flex items-center gap-2 flex-wrap">
          <Gauge className="h-5 w-5 text-purple-600 dark:text-purple-400" />
          IRS Worksheet 2-1 — Estimated Tax Calculator
        </CardTitle>
        <Badge variant="outline" className="text-[10px] no-default-active-elevate" data-testid="badge-effective-rate">
          {effectiveRate.toFixed(1)}% Effective Rate
        </Badge>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="space-y-1">
            {worksheetRows.map((row) => (
              <div
                key={row.testId}
                className={`flex items-center justify-between py-1.5 px-2 rounded text-sm ${
                  row.highlight ? "bg-purple-50 dark:bg-purple-950/20 font-semibold" : ""
                }`}
              >
                <span className="text-muted-foreground text-xs">{row.label}</span>
                <span className={`font-mono font-medium ${row.negative ? "text-red-600 dark:text-red-400" : ""}`} data-testid={row.testId}>
                  {row.negative ? "−" : ""}{formatCurrency(row.value)}
                </span>
              </div>
            ))}
          </div>

          <div className="border-t border-border/50 pt-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="p-3 rounded-md bg-muted/30">
                <p className="text-xs text-muted-foreground">Federal Income Tax</p>
                <p className="text-sm font-bold font-display" data-testid="text-calc-income-tax">
                  {formatCurrency(federalIncomeTax)}
                </p>
              </div>
              <div className="p-3 rounded-md bg-muted/30">
                <p className="text-xs text-muted-foreground">SE Tax (15.3%)</p>
                <p className="text-sm font-bold font-display" data-testid="text-calc-se-tax-total">
                  {formatCurrency(annualSETax)}
                </p>
              </div>
              <div className="p-3 rounded-md bg-muted/30">
                <p className="text-xs text-muted-foreground">
                  {stateEstimate ? `${stateEstimate.stateName} State Tax` : "State Tax"}
                </p>
                <p className="text-sm font-bold font-display" data-testid="text-calc-state-tax">
                  {userState ? formatCurrency(stateTax) : "—"}
                </p>
                {stateEstimate && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {stateEstimate.bucketLabel} ({stateEstimate.effectiveRate}%)
                  </p>
                )}
              </div>
              <div className="p-3 rounded-md bg-purple-50 dark:bg-purple-950/20">
                <p className="text-xs text-muted-foreground">Total Annual Tax</p>
                <p className="text-sm font-bold font-display text-purple-700 dark:text-purple-300" data-testid="text-calc-total-annual">
                  {formatCurrency(totalAnnualTax)}
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Quarterly Payments (Form 1040-ES)</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {deadlines.map((d, i) => {
                const date = parseISO(d);
                const isPast = date < today;
                const isCurrent = i + 1 === currentQuarter;
                return (
                  <div
                    key={d}
                    className={`p-3 rounded-md border ${
                      isCurrent
                        ? "border-purple-300 dark:border-purple-700 bg-purple-50/50 dark:bg-purple-950/20"
                        : isPast
                        ? "border-border/40 bg-muted/20 opacity-60"
                        : "border-border/40"
                    }`}
                    data-testid={`card-quarter-${i + 1}`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <Badge
                        variant={isCurrent ? "default" : isPast ? "secondary" : "outline"}
                        className="text-[10px] no-default-active-elevate"
                      >
                        {quarterLabels[i]}
                      </Badge>
                      {isPast && <CheckCircle2 className="h-3 w-3 text-muted-foreground" />}
                      {isCurrent && <Clock className="h-3 w-3 text-purple-600 dark:text-purple-400" />}
                    </div>
                    <p className="text-sm font-bold font-display mt-1.5">
                      {formatCurrency(quarterlyPayment)}
                    </p>
                    <p className={`text-[10px] mt-0.5 ${isPast ? "line-through text-muted-foreground" : "text-muted-foreground"}`}>
                      Due {format(date, "MMM d")}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {!userState && (
            <div className="flex items-center gap-2 p-2 rounded bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
              <MapPin className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <p className="text-[10px] text-amber-800 dark:text-amber-200">
                Select your state below to include state income tax in your estimate.
              </p>
            </div>
          )}

          <p className="text-[10px] text-muted-foreground leading-relaxed">
            Based on IRS Worksheet 2-1 (Form 1040-ES) for 2026 tax year. Uses federal brackets (single filer), 15.3% SE tax, and ${STANDARD_DEDUCTION_2026.toLocaleString()} standard deduction. {userState ? `Includes ${stateEstimate?.stateName || userState} state tax.` : ""} IRS safe harbor: pay 100% of prior year tax or 90% of current year tax to avoid underpayment penalties.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function UnderpaymentAlert({ summary, user }: { summary: TaxSummary; user: User | null | undefined }) {
  const { isUS, formatCurrency } = useRegion();
  const netProfit = Math.max(0, summary.netProfit);
  const annualSETax = summary.selfEmploymentTax;
  const seDeduction = summary.seDeduction;
  const tipExemption = summary.tipExemption || 0;
  const agi = netProfit - seDeduction - tipExemption;
  const taxableIncome = Math.max(0, agi - STANDARD_DEDUCTION_2026);

  const brackets = [
    { min: 0, max: 11600, rate: 0.10 },
    { min: 11600, max: 47150, rate: 0.12 },
    { min: 47150, max: 100525, rate: 0.22 },
    { min: 100525, max: 191950, rate: 0.24 },
    { min: 191950, max: 243725, rate: 0.32 },
    { min: 243725, max: 609350, rate: 0.35 },
    { min: 609350, max: Infinity, rate: 0.37 },
  ];
  let fedTax = 0;
  let rem = taxableIncome;
  for (const b of brackets) {
    const t = Math.min(rem, b.max - b.min);
    if (t <= 0) break;
    fedTax += t * b.rate;
    rem -= t;
  }

  const userState = user?.stateCode || null;
  const { data: stateEstimate } = useQuery<any>({
    queryKey: ["/api/tax/state-estimate", userState, netProfit],
    queryFn: async () => {
      if (!userState) return null;
      const res = await fetch(`/api/tax/state-estimate?stateCode=${userState}&netProfit=${netProfit}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!userState,
    staleTime: 1000 * 60 * 5,
  });

  const stateTax = stateEstimate?.taxOwed || 0;
  const totalEstimatedTax = fedTax + annualSETax + stateTax;

  if (!isUS || totalEstimatedTax <= 1000) return null;

  return (
    <Alert
      className="border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/20"
      data-testid="banner-underpayment-alert"
    >
      <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
      <AlertTitle className="text-amber-900 dark:text-amber-200 text-sm">
        IRS Alert: Quarterly Payment Required
      </AlertTitle>
      <AlertDescription className="text-amber-800 dark:text-amber-300 text-xs mt-1">
        <p>
          Your estimated annual tax liability of <strong>{formatCurrency(totalEstimatedTax)}</strong> exceeds the $1,000 threshold. You are now required to make quarterly estimated payments to avoid underpayment penalties (IRC §6654).
        </p>
        <div className="flex items-center gap-2 mt-2">
          <Link href="/quarterly">
            <Button variant="outline" size="sm" className="text-xs border-amber-300 dark:border-amber-600" data-testid="button-view-quarterly">
              <Calendar className="h-3 w-3 mr-1" />
              View Quarterly Filing
            </Button>
          </Link>
        </div>
      </AlertDescription>
    </Alert>
  );
}

function StateSelector({ user }: { user: User | null | undefined }) {
  const { isUS } = useRegion();
  const { data: statesData } = useQuery<Record<string, { name: string; tax_type: string; rate_2026: number }>>({
    queryKey: ["/api/states"],
    enabled: isUS,
  });

  const updateStateMutation = useMutation({
    mutationFn: async (stateCode: string) => {
      const res = await apiRequest("PATCH", "/api/profile", { stateCode });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      queryClient.invalidateQueries({ predicate: (query) => (query.queryKey[0] as string)?.startsWith?.("/api/tax") });
    },
  });

  if (!isUS || !statesData) return null;

  const noTaxStates = Object.entries(statesData).filter(([, s]) => s.tax_type === "None").sort((a, b) => a[1].name.localeCompare(b[1].name));
  const flatStates = Object.entries(statesData).filter(([, s]) => s.tax_type === "Flat").sort((a, b) => a[1].name.localeCompare(b[1].name));
  const graduatedStates = Object.entries(statesData).filter(([, s]) => s.tax_type === "Graduated" || s.tax_type === "Decoupled").sort((a, b) => a[1].name.localeCompare(b[1].name));

  const selectedState = user?.stateCode || "";
  const selectedInfo = selectedState ? statesData[selectedState] : null;

  return (
    <Card className="mt-4 border-border/60 shadow-sm" data-testid="card-state-selector">
      <CardContent className="py-4 px-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-full">
              <MapPin className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm font-medium">Your State</p>
              <p className="text-xs text-muted-foreground">Select your state for accurate tax estimates</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={selectedState}
              onValueChange={(val) => updateStateMutation.mutate(val)}
              data-testid="select-state"
            >
              <SelectTrigger className="w-[200px]" data-testid="select-state-trigger">
                <SelectValue placeholder="Select state..." />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>No State Income Tax</SelectLabel>
                  {noTaxStates.map(([code, s]) => (
                    <SelectItem key={code} value={code} data-testid={`option-state-${code}`}>{s.name}</SelectItem>
                  ))}
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel>Flat Tax States</SelectLabel>
                  {flatStates.map(([code, s]) => (
                    <SelectItem key={code} value={code} data-testid={`option-state-${code}`}>{s.name} ({s.rate_2026}%)</SelectItem>
                  ))}
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel>Graduated / Decoupled Tax States</SelectLabel>
                  {graduatedStates.map(([code, s]) => (
                    <SelectItem key={code} value={code} data-testid={`option-state-${code}`}>{s.name} (up to {s.rate_2026}%)</SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            {selectedInfo && (
              <Badge
                variant="outline"
                className={`text-[10px] no-default-active-elevate ${
                  selectedInfo.tax_type === "None"
                    ? "border-green-400 text-green-700 dark:text-green-300"
                    : "border-blue-400 text-blue-700 dark:text-blue-300"
                }`}
                data-testid="badge-state-tax-type"
              >
                {selectedInfo.tax_type === "None"
                  ? "No State Tax"
                  : selectedInfo.tax_type === "Flat"
                  ? `Flat ${selectedInfo.rate_2026}%`
                  : `Graduated (up to ${selectedInfo.rate_2026}%)`}
              </Badge>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ComplianceAlertsBanner() {
  const { data: alerts } = useQuery<any[]>({ queryKey: ["/api/compliance-alerts"] });
  const { data: providerStatus } = useQuery<any>({ queryKey: ["/api/tax-provider/status"] });

  const dismissMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/compliance-alerts/${id}/dismiss`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/compliance-alerts"] }),
  });

  const activeAlerts = alerts?.filter((a: any) => !a.isDismissed) || [];
  if (activeAlerts.length === 0 && providerStatus?.activeProvider === "static") {
    return (
      <Alert className="mb-4" data-testid="alert-provider-static">
        <Radio className="h-4 w-4" />
        <AlertTitle className="flex items-center gap-2 flex-wrap">
          Tax Rate Source: Static Data
          <Badge variant="secondary" className="text-xs no-default-active-elevate">Offline</Badge>
        </AlertTitle>
        <AlertDescription className="text-xs">
          Your tax rates are sourced from a local file. Connect a live provider (Stripe Tax or Avalara) for real-time rate updates and certified accuracy. The IRS Compliance Sentinel is monitoring for regulatory changes.
        </AlertDescription>
      </Alert>
    );
  }

  if (activeAlerts.length === 0) return null;

  return (
    <div className="space-y-2 mb-4" data-testid="compliance-alerts-panel">
      {activeAlerts.slice(0, 5).map((alert: any) => (
        <Alert
          key={alert.id}
          className={
            alert.severity === "critical" ? "border-red-500/50 bg-red-50 dark:bg-red-950/20" :
            alert.severity === "warning" ? "border-yellow-500/50 bg-yellow-50 dark:bg-yellow-950/20" :
            ""
          }
          data-testid={`alert-compliance-${alert.id}`}
        >
          {alert.alertType === "rate_change" ? (
            <RefreshCw className="h-4 w-4" />
          ) : (
            <Bell className="h-4 w-4" />
          )}
          <AlertTitle className="flex items-center justify-between gap-2 flex-wrap">
            <span className="flex items-center gap-2 flex-wrap">
              {alert.title}
              <Badge
                variant={alert.severity === "critical" ? "destructive" : "secondary"}
                className="text-xs no-default-active-elevate"
              >
                {alert.severity}
              </Badge>
              {alert.alertType === "rate_change" && (
                <Badge variant="outline" className="text-xs no-default-active-elevate">Rate Change</Badge>
              )}
            </span>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => dismissMutation.mutate(alert.id)}
              data-testid={`button-dismiss-alert-${alert.id}`}
            >
              <X className="h-3 w-3" />
            </Button>
          </AlertTitle>
          <AlertDescription className="text-xs">
            <p>{alert.description}</p>
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              {alert.sourceUrl && (
                <a
                  href={alert.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary underline flex items-center gap-1"
                  data-testid={`link-alert-source-${alert.id}`}
                >
                  <ExternalLink className="h-3 w-3" />
                  View Source
                </a>
              )}
              <span className="text-xs text-muted-foreground">
                {alert.source} {alert.createdAt && `- ${format(new Date(alert.createdAt), "MMM d, yyyy")}`}
              </span>
            </div>
          </AlertDescription>
        </Alert>
      ))}
      {activeAlerts.length > 5 && (
        <p className="text-xs text-muted-foreground text-center">
          +{activeAlerts.length - 5} more alerts
        </p>
      )}
    </div>
  );
}

function TaxHealthBar({ summary, user }: { summary: TaxSummary; user: User | null }) {
  const hasIncome = summary.grossIncome > 0;
  const hasExpenses = summary.totalOtherExpenses > 0;
  const hasMileage = summary.totalMiles > 0;
  const isVerified = !!user?.isVerified;

  const checks = [
    { done: isVerified, label: "Identity Verified" },
    { done: hasIncome, label: "Income Logged" },
    { done: hasExpenses, label: "Expenses Tracked" },
    { done: hasMileage, label: "Mileage Recorded" },
  ];
  const completedCount = checks.filter(c => c.done).length;
  const healthPercent = Math.round((completedCount / checks.length) * 100);

  const tipSavings = (summary.tipExemption || 0) * 0.22;
  const mileageSavings = summary.mileageDeduction * 0.22;
  const expenseSavings = summary.totalOtherExpenses * 0.22;
  const seDeductionSavings = summary.seDeduction * 0.22;
  const totalEstimatedSavings = tipSavings + mileageSavings + expenseSavings + seDeductionSavings;

  return (
    <div className="rounded-md border border-border bg-card p-4" data-testid="tax-health-bar">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className={`flex items-center justify-center h-10 w-10 rounded-md shrink-0 ${
            healthPercent === 100
              ? "bg-primary/15 text-primary"
              : healthPercent >= 50
              ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
              : "bg-red-500/15 text-red-600 dark:text-red-400"
          }`}>
            <Shield className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium">Tax Health</span>
              <Badge
                variant="outline"
                className={`text-[10px] no-default-active-elevate ${
                  healthPercent === 100
                    ? "border-primary/40 text-primary"
                    : healthPercent >= 50
                    ? "border-amber-400/40 text-amber-600 dark:text-amber-400"
                    : "border-red-400/40 text-red-600 dark:text-red-400"
                }`}
                data-testid="badge-health-percent"
              >
                {healthPercent}% Ready
              </Badge>
            </div>
            <div className="flex items-center gap-1.5 mt-1.5">
              {checks.map((c, i) => (
                <div key={i} className="flex items-center gap-1">
                  <div className={`h-1.5 w-8 rounded-full ${
                    c.done ? "bg-primary" : "bg-muted-foreground/20"
                  }`} />
                </div>
              ))}
              <span className="text-[10px] text-muted-foreground ml-1">
                {completedCount}/{checks.length}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 sm:gap-6">
          <div className="text-right">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Est. Tax Savings</p>
            <p className="text-lg font-semibold text-primary" data-testid="text-health-savings">
              ${totalEstimatedSavings.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Net Profit</p>
            <p className="text-lg font-semibold" data-testid="text-health-profit">
              ${Math.max(0, summary.netProfit).toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

interface AuditRiskResult {
  overallRisk: "low" | "medium" | "high";
  riskScore: number;
  totalExpenses: number;
  categoryBreakdown: { category: string; amount: number; average: number; deviation: number; flag: string }[];
  recommendations: string[];
}

function AuditRiskBadge() {
  const { t } = useTranslation();
  const { data: riskData } = useQuery<AuditRiskResult>({ queryKey: ["/api/audit-risk"] });

  if (!riskData || riskData.totalExpenses === 0) return null;

  const riskColors = {
    low: { bg: "bg-green-50 dark:bg-green-950/20", border: "border-green-200 dark:border-green-800", text: "text-green-700 dark:text-green-400", badge: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
    medium: { bg: "bg-amber-50 dark:bg-amber-950/20", border: "border-amber-200 dark:border-amber-800", text: "text-amber-700 dark:text-amber-400", badge: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400" },
    high: { bg: "bg-red-50 dark:bg-red-950/20", border: "border-red-200 dark:border-red-800", text: "text-red-700 dark:text-red-400", badge: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" },
  };
  const colors = riskColors[riskData.overallRisk];
  const riskLabel = { low: t("dashboard.lowRisk"), medium: t("dashboard.mediumRisk"), high: t("dashboard.highRisk") };
  const flaggedCategories = riskData.categoryBreakdown.filter(c => c.deviation > 20);

  return (
    <div className={`rounded-md border ${colors.border} ${colors.bg} p-4`} data-testid="banner-audit-risk">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-full ${colors.badge}`}>
          <Shield className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-sm font-medium ${colors.text}`}>{t("dashboard.auditSentinel")}</span>
            <Badge variant="outline" className={`text-[10px] no-default-active-elevate ${colors.badge}`} data-testid="badge-audit-risk-level">
              {riskLabel[riskData.overallRisk]} — Score {riskData.riskScore}
            </Badge>
          </div>
          {flaggedCategories.length > 0 && (
            <p className="text-xs text-muted-foreground mt-1" data-testid="text-audit-warning">
              {t("dashboard.categoriesAboveAverage", { count: flaggedCategories.length })}.{" "}
              <Link href="/audit-center" className="underline text-primary hover:text-primary/80">{t("common.actions")}</Link>
            </p>
          )}
          {riskData.overallRisk === "low" && (
            <p className="text-xs text-muted-foreground mt-1">{t("dashboard.auditProof")}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function PenaltyCountdown() {
  const { t } = useTranslation();
  const today = new Date();
  const taxYear = today.getFullYear();
  const deadlines = [
    { label: "Q1", date: `${taxYear}-04-15`, desc: "1040-ES Payment 1" },
    { label: "Q2", date: `${taxYear}-06-15`, desc: "1040-ES Payment 2" },
    { label: "Q3", date: `${taxYear}-09-15`, desc: "1040-ES Payment 3" },
    { label: "Q4", date: `${taxYear + 1}-01-15`, desc: "1040-ES Payment 4" },
    { label: "Annual", date: `${taxYear + 1}-04-15`, desc: "Annual Return (1040)" },
  ];

  const nextDeadline = deadlines.find(d => parseISO(d.date) > today);
  if (!nextDeadline) return null;

  const daysLeft = differenceInDays(parseISO(nextDeadline.date), today);
  const isUrgent = daysLeft <= 14;
  const isWarning = daysLeft <= 30;

  return (
    <div
      className={`rounded-md border p-3 flex items-center gap-3 ${
        isUrgent
          ? "border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/20"
          : isWarning
          ? "border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20"
          : "border-border bg-card"
      }`}
      data-testid="banner-penalty-countdown"
    >
      <div className={`p-2 rounded-full shrink-0 ${
        isUrgent ? "bg-red-100 dark:bg-red-900/30" : isWarning ? "bg-amber-100 dark:bg-amber-900/30" : "bg-muted"
      }`}>
        <Calendar className={`h-4 w-4 ${
          isUrgent ? "text-red-600 dark:text-red-400" : isWarning ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"
        }`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">{t("penalty.title")}</span>
          <Badge
            variant={isUrgent ? "destructive" : "outline"}
            className="text-[10px] no-default-active-elevate"
            data-testid="badge-days-until-deadline"
          >
            {t("penalty.daysLeft", { count: daysLeft })}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5" data-testid="text-next-deadline">
          {t("penalty.nextDeadline", { desc: nextDeadline.desc, date: format(parseISO(nextDeadline.date), "MMMM d, yyyy") })}
        </p>
      </div>
    </div>
  );
}

function WealthForecast({ summary }: { summary: TaxSummary }) {
  const { t } = useTranslation();
  const netProfit = summary.netProfit;
  const seDeduction = summary.seDeduction;
  const tipExemption = summary.tipExemption || 0;
  const taxableIncome = netProfit - seDeduction - tipExemption;

  const solo401kLimit = Math.min(23500, netProfit * 0.25);
  const iraLimit = 7000;
  const sepLimit = Math.min(69000, netProfit * 0.25);

  const options = [
    { name: t("wealth.solo401k"), maxContribution: solo401kLimit },
    { name: t("wealth.traditionalIra"), maxContribution: iraLimit },
    { name: t("wealth.sepIra"), maxContribution: sepLimit },
  ];

  const effectiveRate = taxableIncome > 0 ? (summary.selfEmploymentTax / taxableIncome) * 100 + 22 : 22;
  const marginalRate = effectiveRate / 100;

  if (netProfit < 5000) return null;

  return (
    <Card className="border-border/60 shadow-sm" data-testid="card-wealth-forecast">
      <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
        <CardTitle className="text-base font-medium flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          {t("wealth.title")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {options.filter(o => o.maxContribution > 0).map((opt) => {
            const taxSaved = opt.maxContribution * marginalRate;
            return (
              <div key={opt.name} className="p-3 rounded-md bg-muted/30 border border-border/40" data-testid={`card-retirement-${opt.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">{opt.name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400" data-testid={`text-tax-saved-${opt.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}>
                      {t("wealth.saveTax", { amount: taxSaved.toLocaleString(undefined, { maximumFractionDigits: 0 }) })}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {t("wealth.contribution", { amount: opt.maxContribution.toLocaleString(undefined, { maximumFractionDigits: 0 }) })}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            {t("wealth.disclaimer")}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function SpendingAnomalies() {
  const { t } = useTranslation();
  const { formatCurrency } = useRegion();
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());

  const { data, isLoading } = useQuery<{
    anomalies: Array<{
      id: number;
      date: string;
      amount: number;
      category: string;
      description: string | null;
      average: number;
      stdDev: number;
      zScore: number;
    }>;
    message?: string;
  }>({
    queryKey: ["/api/spending-anomalies"],
  });

  const anomalies = data?.anomalies?.filter((a) => !dismissed.has(a.id)) || [];

  if (isLoading || anomalies.length === 0) return null;

  return (
    <div className="space-y-2" data-testid="spending-anomalies">
      {anomalies.map((a) => (
        <Alert key={a.id} className="border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertTitle className="text-sm font-medium text-amber-800 dark:text-amber-300">
            Unusual {a.category} Expense
          </AlertTitle>
          <AlertDescription className="text-xs text-amber-700 dark:text-amber-400 flex items-center justify-between">
            <span>
              {a.description ? `"${a.description}" — ` : ""}
              {formatCurrency(a.amount)} is significantly above your {a.category} average of {formatCurrency(a.average)}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="ml-2 h-6 px-2 text-xs"
              data-testid={`button-dismiss-anomaly-${a.id}`}
              onClick={() => setDismissed((prev) => new Set(prev).add(a.id))}
            >
              <X className="h-3 w-3 mr-1" /> Dismiss
            </Button>
          </AlertDescription>
        </Alert>
      ))}
    </div>
  );
}

function GoalTracker({ summary, user }: { summary: TaxSummary; user: User | null }) {
  const { formatCurrency, currencySymbol } = useRegion();
  const [goalInput, setGoalInput] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  const currentGoal = user?.earningsGoal ? Number(user.earningsGoal) : 0;
  const ytdEarnings = summary.grossIncome;
  const progress = currentGoal > 0 ? Math.min((ytdEarnings / currentGoal) * 100, 100) : 0;

  const now = new Date();
  const endOfYear = new Date(now.getFullYear(), 11, 31);
  const daysRemaining = Math.max(1, differenceInDays(endOfYear, now));
  const remaining = Math.max(0, currentGoal - ytdEarnings);
  const dailyRate = remaining / daysRemaining;

  const avgDailyEarnings = ytdEarnings / Math.max(1, differenceInDays(now, new Date(now.getFullYear(), 0, 1)));
  const estimatedHoursPerDay = avgDailyEarnings > 0 ? (dailyRate / avgDailyEarnings) * 8 : 0;

  const goalMutation = useMutation({
    mutationFn: async (goal: number) => {
      await apiRequest("PATCH", "/api/earnings-goal", { goal });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      setIsEditing(false);
    },
  });

  const handleSetGoal = () => {
    const num = Number(goalInput);
    if (!isNaN(num) && num > 0) {
      goalMutation.mutate(num);
    }
  };

  let statusColor = "text-blue-600 dark:text-blue-400";
  let statusMessage = "";
  if (currentGoal > 0) {
    if (progress >= 100) {
      statusColor = "text-green-600 dark:text-green-400";
      statusMessage = "You've reached your goal!";
    } else if (dailyRate <= avgDailyEarnings * 1.1) {
      statusColor = "text-green-600 dark:text-green-400";
      statusMessage = "You're on track";
    } else if (dailyRate <= avgDailyEarnings * 1.5) {
      statusColor = "text-amber-600 dark:text-amber-400";
      statusMessage = "Slightly behind — pick up the pace";
    } else {
      statusColor = "text-red-600 dark:text-red-400";
      statusMessage = "Falling behind — consider extra shifts";
    }
  }

  if (!currentGoal && !isEditing) {
    return (
      <Card className="border-dashed border-2 border-primary/30" data-testid="card-set-goal">
        <CardContent className="flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-primary/10">
              <Target className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-medium text-sm">Set Your Annual Earnings Goal</p>
              <p className="text-xs text-muted-foreground">Track your progress and get daily targets</p>
            </div>
          </div>
          <Button size="sm" onClick={() => setIsEditing(true)} data-testid="button-set-goal">
            Set Goal
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (isEditing || (!currentGoal && isEditing)) {
    return (
      <Card data-testid="card-edit-goal">
        <CardContent className="py-4">
          <div className="flex items-center gap-3">
            <Target className="h-5 w-5 text-primary" />
            <p className="font-medium text-sm">Annual Earnings Goal</p>
          </div>
          <div className="flex gap-2 mt-3">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">{currencySymbol}</span>
              <Input
                type="number"
                placeholder="e.g. 50000"
                value={goalInput}
                onChange={(e) => setGoalInput(e.target.value)}
                className="pl-7"
                data-testid="input-goal-amount"
              />
            </div>
            <Button onClick={handleSetGoal} disabled={goalMutation.isPending} data-testid="button-save-goal">
              {goalMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
            <Button variant="ghost" onClick={() => setIsEditing(false)} data-testid="button-cancel-goal">
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="card-goal-tracker">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            Annual Goal Progress
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => { setGoalInput(String(currentGoal)); setIsEditing(true); }}
            data-testid="button-edit-goal"
          >
            Edit
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">
            {formatCurrency(ytdEarnings)} of {formatCurrency(currentGoal)}
          </span>
          <span className={`font-medium ${statusColor}`}>{Math.round(progress)}%</span>
        </div>
        <Progress value={progress} className="h-2" />
        <p className={`text-xs font-medium ${statusColor}`} data-testid="text-goal-status">{statusMessage}</p>
        {remaining > 0 && (
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="text-center p-2 rounded-lg bg-muted/50">
              <p className="text-lg font-semibold">{formatCurrency(dailyRate)}</p>
              <p className="text-[10px] text-muted-foreground">needed per day</p>
            </div>
            <div className="text-center p-2 rounded-lg bg-muted/50">
              <p className="text-lg font-semibold">{daysRemaining}</p>
              <p className="text-[10px] text-muted-foreground">days remaining</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SmartTaxPredictor() {
  const { formatCurrency } = useRegion();
  const [enabled, setEnabled] = useState(false);

  const { data, isLoading, error } = useQuery<{
    prediction: {
      projectedAnnualIncome: number;
      projectedAnnualExpenses: number;
      projectedMileageDeduction: number;
      projectedNetProfit: number;
      estimatedSETax: number;
      estimatedFederalTax: number;
      estimatedStateTax: number;
      estimatedTotalTax: number;
      estimatedQuarterlyPayment: number;
      effectiveTaxRate: number;
      tips: string[];
      riskLevel: string;
      riskExplanation: string;
      savingsOpportunities: string[];
    };
    dataSummary: {
      ytdIncome: number;
      ytdExpenses: number;
      ytdMiles: number;
      daysRemaining: number;
    };
    generatedAt: string;
  }>({
    queryKey: ["/api/smart-tax-prediction"],
    enabled,
    staleTime: 1000 * 60 * 30,
  });

  const p = data?.prediction;
  const ds = data?.dataSummary;

  const riskColors: Record<string, string> = {
    low: "text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30",
    medium: "text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30",
    high: "text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30",
  };

  if (!enabled) {
    return (
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent" data-testid="card-tax-predictor-cta">
        <CardContent className="flex items-center justify-between py-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-full bg-primary/10">
              <TrendingUp className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-medium text-sm">Smart Tax Predictor</p>
              <p className="text-xs text-muted-foreground">AI-powered year-end tax liability forecast based on your data</p>
            </div>
          </div>
          <Button onClick={() => setEnabled(true)} data-testid="button-run-prediction">
            <Lightbulb className="h-4 w-4 mr-2" /> Analyze
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card data-testid="card-tax-predictor-loading">
        <CardContent className="py-8 flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">AI is analyzing your financial data...</p>
        </CardContent>
      </Card>
    );
  }

  if (error || !p) {
    return (
      <Card data-testid="card-tax-predictor-error">
        <CardContent className="py-4 flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-red-500" />
          <div>
            <p className="text-sm font-medium">Prediction unavailable</p>
            <p className="text-xs text-muted-foreground">Could not generate tax prediction. Try again later.</p>
          </div>
          <Button variant="outline" size="sm" className="ml-auto" onClick={() => { queryClient.invalidateQueries({ queryKey: ["/api/smart-tax-prediction"] }); }} data-testid="button-retry-prediction">
            <RefreshCw className="h-3 w-3 mr-1" /> Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="card-tax-predictor">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Smart Tax Predictor
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge className={riskColors[p.riskLevel] || riskColors.low} data-testid="badge-risk-level">
              {p.riskLevel.toUpperCase()} RISK
            </Badge>
            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => { queryClient.invalidateQueries({ queryKey: ["/api/smart-tax-prediction"] }); }} data-testid="button-refresh-prediction">
              <RefreshCw className="h-3 w-3" />
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          AI projection based on {ds?.daysRemaining} days remaining in the tax year
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="text-center p-3 rounded-lg bg-muted/50" data-testid="stat-projected-income">
            <p className="text-lg font-bold text-green-600 dark:text-green-400">{formatCurrency(p.projectedAnnualIncome)}</p>
            <p className="text-[10px] text-muted-foreground">Projected Income</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-muted/50" data-testid="stat-projected-profit">
            <p className="text-lg font-bold">{formatCurrency(p.projectedNetProfit)}</p>
            <p className="text-[10px] text-muted-foreground">Projected Net Profit</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-muted/50" data-testid="stat-total-tax">
            <p className="text-lg font-bold text-red-600 dark:text-red-400">{formatCurrency(p.estimatedTotalTax)}</p>
            <p className="text-[10px] text-muted-foreground">Estimated Total Tax</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-muted/50" data-testid="stat-effective-rate">
            <p className="text-lg font-bold text-primary">{p.effectiveTaxRate.toFixed(1)}%</p>
            <p className="text-[10px] text-muted-foreground">Effective Tax Rate</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="p-2 rounded bg-muted/30 text-center">
            <p className="font-medium">{formatCurrency(p.estimatedSETax)}</p>
            <p className="text-muted-foreground">SE Tax</p>
          </div>
          <div className="p-2 rounded bg-muted/30 text-center">
            <p className="font-medium">{formatCurrency(p.estimatedFederalTax)}</p>
            <p className="text-muted-foreground">Federal</p>
          </div>
          <div className="p-2 rounded bg-muted/30 text-center">
            <p className="font-medium">{formatCurrency(p.estimatedStateTax)}</p>
            <p className="text-muted-foreground">State</p>
          </div>
        </div>

        <div className="p-3 rounded-lg bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200/50 dark:border-blue-800/30">
          <p className="text-xs font-medium text-blue-800 dark:text-blue-300 mb-1">Quarterly Payment Estimate</p>
          <p className="text-lg font-bold text-blue-700 dark:text-blue-300" data-testid="stat-quarterly-payment">
            {formatCurrency(p.estimatedQuarterlyPayment)}
          </p>
          <p className="text-[10px] text-blue-600/80 dark:text-blue-400/80">per quarter to avoid underpayment penalties</p>
        </div>

        {p.tips && p.tips.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium flex items-center gap-1">
              <Lightbulb className="h-3 w-3 text-amber-500" /> AI Tax Saving Tips
            </p>
            {p.tips.map((tip, i) => (
              <div key={i} className="text-xs text-muted-foreground flex items-start gap-2 pl-1" data-testid={`text-tip-${i}`}>
                <CheckCircle2 className="h-3 w-3 text-green-500 mt-0.5 shrink-0" />
                <span>{tip}</span>
              </div>
            ))}
          </div>
        )}

        {p.savingsOpportunities && p.savingsOpportunities.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium flex items-center gap-1">
              <DollarSign className="h-3 w-3 text-green-500" /> Potential Savings Opportunities
            </p>
            {p.savingsOpportunities.map((opp, i) => (
              <div key={i} className="text-xs text-muted-foreground flex items-start gap-2 pl-1" data-testid={`text-savings-${i}`}>
                <TrendingUp className="h-3 w-3 text-primary mt-0.5 shrink-0" />
                <span>{opp}</span>
              </div>
            ))}
          </div>
        )}

        <p className="text-[10px] text-muted-foreground italic">{p.riskExplanation}</p>
        {data?.generatedAt && (
          <p className="text-[10px] text-muted-foreground text-right">
            Generated: {format(parseISO(data.generatedAt), "MMM d, h:mm a")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function MaintenanceAlerts() {
  const { formatCurrency } = useRegion();

  const { data, isLoading } = useQuery<{
    predictions: Array<{
      vehicleId: number;
      vehicleName: string;
      totalMiles: number;
      milesSinceLastService: number;
      lastMaintenanceDate: string | null;
      avgIntervalDays: number;
      predictedNextServiceDate: string | null;
      needsService: boolean;
      avgMaintenanceCost: number;
      maintenanceCount: number;
    }>;
  }>({
    queryKey: ["/api/maintenance-predictions"],
  });

  const alerts = data?.predictions?.filter((p) => p.needsService) || [];

  if (isLoading || alerts.length === 0) return null;

  return (
    <div className="space-y-2" data-testid="maintenance-alerts">
      {alerts.map((p) => (
        <Alert key={p.vehicleId} className="border-blue-300 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-950/20">
          <Wrench className="h-4 w-4 text-blue-600" />
          <AlertTitle className="text-sm font-medium text-blue-800 dark:text-blue-300">
            {p.vehicleName} — Service Recommended
          </AlertTitle>
          <AlertDescription className="text-xs text-blue-700 dark:text-blue-400 space-y-1">
            <p>
              {p.milesSinceLastService.toLocaleString()} miles since last service
              {p.lastMaintenanceDate ? ` on ${format(parseISO(p.lastMaintenanceDate), "MMM d, yyyy")}` : ""}.
            </p>
            {p.predictedNextServiceDate && (
              <p>
                Based on your history (every ~{p.avgIntervalDays} days), next service predicted around{" "}
                <span className="font-medium">{format(parseISO(p.predictedNextServiceDate), "MMM d, yyyy")}</span>.
              </p>
            )}
            {p.avgMaintenanceCost > 0 && (
              <p className="text-muted-foreground">Avg service cost: {formatCurrency(p.avgMaintenanceCost)}</p>
            )}
          </AlertDescription>
        </Alert>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const { data: summary, isLoading } = useTaxSummary();
  const { data: mileageData } = useMileageLogs();
  const { user } = useAuth();
  const { currencySymbol, isUK, isUS, taxModules, formatCurrency } = useRegion();

  const isFreeUser = !user?.subscriptionStatus || user.subscriptionStatus === "free" || user.subscriptionStatus === "basic";
  const segmentConfig = getSegmentConfig(user?.userSegment);

  if (isLoading || !summary) {
    return (
      <Layout>
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
             {[1,2,3,4].map(i => <Skeleton key={i} className="h-32 rounded-xl" />)}
          </div>
          <Skeleton className="h-[400px] rounded-xl" />
        </div>
      </Layout>
    );
  }

  const stats = [
    {
      title: segmentConfig.earningsLabel,
      value: summary.grossIncome,
      icon: Wallet,
      color: "text-green-600 dark:text-green-400",
      bg: "bg-green-100 dark:bg-green-900/30",
      prefix: currencySymbol
    },
    {
      title: "Total Deductions",
      value: summary.totalDeductions,
      icon: TrendingDown,
      color: "text-red-600 dark:text-red-400",
      bg: "bg-red-100 dark:bg-red-900/30",
      prefix: `-${currencySymbol}`
    },
    {
      title: "Net Profit",
      value: summary.netProfit,
      icon: DollarSign,
      color: "text-primary",
      bg: "bg-primary/10",
      prefix: currencySymbol
    },
    {
      title: isUK ? "Reserved for Taxes" : "Reserved for Taxes",
      value: summary.selfEmploymentTax,
      icon: FileText,
      color: "text-blue-600 dark:text-blue-400",
      bg: "bg-blue-100 dark:bg-blue-900/30",
      prefix: currencySymbol,
      subtitle: isUK ? "Class 4 NIC + Income Tax" : "SE Tax (15.3% of 92.35%)"
    }
  ];

  return (
    <Layout>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-dashboard-title">{segmentConfig.dashboardHeading}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{segmentConfig.dashboardSubheading}</p>
        </div>
        <div className="flex gap-2 w-full md:w-auto flex-wrap">
          <IncomeForm />
          <AutoGrossForm />
          <Form1099K />
          <ExpenseForm />
          <div className="hidden md:block"><ReceiptCapture /></div>
          <StatementParser />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 md:hidden">
        <ReceiptCapture
          trigger={
            <button
              className="flex flex-col items-center justify-center gap-1.5 p-4 rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 hover:bg-primary/10 active:bg-primary/15 transition-colors touch-manipulation min-h-[80px] w-full"
              data-testid="button-scan-receipt-mobile"
            >
              <span className="text-2xl">📷</span>
              <span className="text-xs font-medium text-primary">Scan Receipt</span>
            </button>
          }
        />
        <Link href="/incomes">
          <div className="flex flex-col items-center justify-center gap-1.5 p-4 rounded-xl border border-border/60 bg-card hover:bg-muted/30 active:bg-muted/50 transition-colors touch-manipulation min-h-[80px]">
            <span className="text-2xl">💰</span>
            <span className="text-xs font-medium">Add Income</span>
          </div>
        </Link>
        <Link href="/expenses">
          <div className="flex flex-col items-center justify-center gap-1.5 p-4 rounded-xl border border-border/60 bg-card hover:bg-muted/30 active:bg-muted/50 transition-colors touch-manipulation min-h-[80px]">
            <span className="text-2xl">🧾</span>
            <span className="text-xs font-medium">Log Expense</span>
          </div>
        </Link>
        <Link href="/mileage">
          <div className="flex flex-col items-center justify-center gap-1.5 p-4 rounded-xl border border-border/60 bg-card hover:bg-muted/30 active:bg-muted/50 transition-colors touch-manipulation min-h-[80px]">
            <span className="text-2xl">🚗</span>
            <span className="text-xs font-medium">Log Miles</span>
          </div>
        </Link>
      </div>

      <TaxHealthBar summary={summary} user={user} />

      <AuditRiskBadge />

      <SpendingAnomalies />

      <UnderpaymentAlert summary={summary} user={user} />

      <PenaltyCountdown />

      <ComplianceAlertsBanner />

      {isFreeUser && <FreeRetentionAlert user={user} />}

      <QuarterlyOdometerReminder />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, i) => (
          <motion.div
            key={stat.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
          >
            <Card className="border-border/60 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.title}
                </CardTitle>
                <div className={`p-2 rounded-full ${stat.bg}`}>
                  <stat.icon className={`h-4 w-4 ${stat.color}`} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold font-display tracking-tight" data-testid={`text-stat-${stat.title.toLowerCase().replace(/\s+/g, '-')}`}>
                  {stat.prefix}{Math.abs(Number(stat.value)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                {stat.subtitle && (
                  <p className="text-xs text-muted-foreground mt-1">{stat.subtitle}</p>
                )}
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6">
        <Card className="border-border/60 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Mileage Deduction</CardTitle>
            <div className="p-2 rounded-full bg-orange-100 dark:bg-orange-900/30">
              <Car className="h-4 w-4 text-orange-600 dark:text-orange-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-display tracking-tight" data-testid="text-mileage-deduction">
              ${summary.mileageDeduction.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {summary.totalMiles.toLocaleString()} miles at ${summary.mileageRate}/mi (IRS 2026)
            </p>
            <p className="text-xs text-muted-foreground mt-2 leading-relaxed" data-testid="text-mileage-disclaimer">
              My Cab Tax USA relies on device GPS and user input. We do not guarantee 100% mileage accuracy. Drivers should cross-reference logs with their vehicle's odometer as required by IRS Publication 463.
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Quarterly Payment</CardTitle>
            <div className="p-2 rounded-full bg-purple-100 dark:bg-purple-900/30">
              <DollarSign className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-display tracking-tight" data-testid="text-quarterly-payment">
              ${summary.estimatedQuarterlyPayment.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Estimated per quarter
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Upcoming Deadlines</CardTitle>
            <div className="p-2 rounded-full bg-yellow-100 dark:bg-yellow-900/30">
              <Calendar className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {summary.quarterlyDeadlines.map((d, i) => {
                const date = parseISO(d);
                const isPast = date < new Date();
                return (
                  <div key={d} className="flex items-center gap-2">
                    <Badge variant={isPast ? "secondary" : "default"} className="text-xs no-default-active-elevate">
                      Q{i + 1}
                    </Badge>
                    <span className={`text-sm ${isPast ? 'text-muted-foreground line-through' : 'font-medium'}`}>
                      {format(date, "MMM d, yyyy")}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Desktop two-column layout (≥1024 px) ─────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">

        {/* Left — main analytics column */}
        <div className="space-y-6 min-w-0">
          {isUS && <SmallEarnerGate grossIncome={summary.grossIncome} />}
          {taxModules.showEstimatedTax && <QuarterlyEstimatedTaxCalculator summary={summary} user={user} />}

          <div className="animate-in fade-in slide-in-from-bottom-8 duration-700 delay-300">
            <DashboardCharts summary={summary} />
          </div>

          <ProfitabilityHeatmap />

          <SmartSummaryMoneySaved summary={summary} />

          <SegmentProTips />
        </div>

        {/* Right — AI insights & tools column */}
        <div className="space-y-4">
          <SmartTaxPredictor />
          <GoalTracker summary={summary} user={user} />
          {isUS && <StateSelector user={user} />}
          <MaintenanceAlerts />
          <WealthForecast summary={summary} />
        </div>

      </div>

      {/* ── Full-width bottom sections ────────────────────────────────────── */}
      <ExportSection summary={summary} mileageLogs={mileageData || []} />
      <SubmissionReadinessChecklist />
      <FinalizeSubmissionSection summary={summary} />
    </Layout>
  );
}

function SegmentProTips() {
  const { user } = useAuth();
  const segmentConfig = getSegmentConfig(user?.userSegment);
  const { data: subscription } = useSubscription();
  const isPro = subscription?.tier === "pro";

  const tips = isPro
    ? [...segmentConfig.proTips, ...segmentConfig.vaultTips]
    : segmentConfig.proTips;

  return (
    <Card className="mt-6 border-border/60 shadow-sm" data-testid="card-segment-pro-tips">
      <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
        <CardTitle className="text-base font-medium flex items-center gap-2 flex-wrap">
          <Lightbulb className="h-5 w-5 text-amber-500 dark:text-amber-400" />
          {segmentConfig.shortLabel} Tax Tips
        </CardTitle>
        <Badge variant="secondary" className="text-xs no-default-active-elevate" data-testid="badge-segment-tips-count">
          {tips.length} tips
        </Badge>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {tips.map((tip, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              <div className="h-1.5 w-1.5 rounded-full bg-amber-500 dark:bg-amber-400 shrink-0 mt-2" />
              <span className="text-foreground/80">{tip}</span>
            </li>
          ))}
        </ul>
        {isPro && segmentConfig.vaultTips.length > 0 && (
          <div className="mt-4 pt-3 border-t">
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5 text-primary" />
              Vault tips included with your Pro subscription for 7-year IRS-compliant storage.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SmartSummaryMoneySaved({ summary }: { summary: TaxSummary }) {
  const tipSavings = (summary.tipExemption || 0) * 0.22;
  const mileageSavings = summary.mileageDeduction * 0.22;
  const expenseSavings = summary.totalOtherExpenses * 0.22;
  const seDeductionSavings = summary.seDeduction * 0.22;
  
  const saltExpenses = (summary.expensesByCategory["Property Tax (SALT)"] || 0) + (summary.expensesByCategory["Home Office"] || 0);
  const saltCapped = Math.min(saltExpenses, summary.saltDeductionCap || 40000);
  const saltSavings = saltCapped * 0.22;
  
  const totalSavings = tipSavings + mileageSavings + expenseSavings + seDeductionSavings + saltSavings;
  
  const savingsItems = [
    {
      label: "Mileage Deduction",
      amount: summary.mileageDeduction,
      savings: mileageSavings,
      description: `${summary.totalMiles.toLocaleString()} miles at $${summary.mileageRate}/mi`,
      color: "text-orange-600 dark:text-orange-400",
      bgColor: "bg-orange-100 dark:bg-orange-900/30",
    },
    {
      label: "Tips Exemption (2026)",
      amount: summary.tipExemption || 0,
      savings: tipSavings,
      description: "Federal income tax exempt under OBBBA",
      color: "text-green-600 dark:text-green-400",
      bgColor: "bg-green-100 dark:bg-green-900/30",
      isNew: true,
    },
    {
      label: "Business Expenses",
      amount: summary.totalOtherExpenses,
      savings: expenseSavings,
      description: "Schedule C deductible expenses",
      color: "text-blue-600 dark:text-blue-400",
      bgColor: "bg-blue-100 dark:bg-blue-900/30",
    },
    {
      label: "SE Tax Deduction",
      amount: summary.seDeduction,
      savings: seDeductionSavings,
      description: "50% of self-employment tax deduction",
      color: "text-purple-600 dark:text-purple-400",
      bgColor: "bg-purple-100 dark:bg-purple-900/30",
    },
  ];

  if (saltExpenses > 0) {
    savingsItems.push({
      label: "SALT Deductions (2026)",
      amount: saltCapped,
      savings: saltSavings,
      description: `Property tax & home office (capped at $${(summary.saltDeductionCap || 40000).toLocaleString()})`,
      color: "text-amber-600 dark:text-amber-400",
      bgColor: "bg-amber-100 dark:bg-amber-900/30",
      isNew: true,
    });
  }

  return (
    <Card className="mt-8 border-border/60 shadow-sm" data-testid="card-smart-summary">
      <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
        <CardTitle className="text-base font-medium flex items-center gap-2 flex-wrap">
          <Shield className="h-5 w-5 text-green-600 dark:text-green-400" />
          Smart Summary: Money Saved
        </CardTitle>
        <Badge variant="outline" className="text-xs border-green-400 text-green-700 dark:text-green-300 no-default-active-elevate" data-testid="badge-total-savings">
          ${totalSavings.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Saved
        </Badge>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Estimated tax savings from your tracked deductions and 2026 tax law changes (based on 22% marginal rate).
          </p>

          <div className="space-y-2">
            {savingsItems
              .filter(item => item.amount > 0)
              .map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between gap-3 p-3 rounded-md bg-muted/20 border border-border/30"
                  data-testid={`row-savings-${item.label.toLowerCase().replace(/[^a-z]/g, '-')}`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className={`p-1.5 rounded-full ${item.bgColor} shrink-0`}>
                      <DollarSign className={`h-3.5 w-3.5 ${item.color}`} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-sm font-medium">{item.label}</p>
                        {(item as any).isNew && (
                          <Badge variant="outline" className="text-[9px] border-green-400 text-green-700 dark:text-green-300 no-default-active-elevate">
                            NEW 2026
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{item.description}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold font-display">
                      ${item.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    <p className={`text-xs font-medium ${item.color}`}>
                      -${item.savings.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} tax
                    </p>
                  </div>
                </div>
              ))}
          </div>

          {savingsItems.filter(item => item.amount > 0).length === 0 && (
            <div className="text-center py-6">
              <p className="text-sm text-muted-foreground">
                Start tracking income, mileage, and expenses to see your estimated tax savings here.
              </p>
            </div>
          )}

          <div className="flex items-center justify-between gap-2 p-3 rounded-md bg-green-50/50 dark:bg-green-950/20 border border-green-200/60 dark:border-green-800/40">
            <div>
              <p className="text-sm font-medium text-green-900 dark:text-green-200">Total Estimated Tax Savings</p>
              <p className="text-xs text-green-800/70 dark:text-green-300/70">Across all tracked deductions and exemptions</p>
            </div>
            <p className="text-xl font-bold font-display text-green-700 dark:text-green-300" data-testid="text-total-savings-amount">
              ${totalSavings.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SubmissionReadinessChecklist() {
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/submission-readiness"],
  });

  if (isLoading) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.55 }}
        className="mt-6"
      >
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Gauge className="h-4 w-4" />
              Filing Readiness
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Skeleton className="h-24 w-full" />
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  if (!data) return null;

  const checklist: Array<{ label: string; included: boolean; description?: string }> = data.checklist || [];
  const readyCount = checklist.filter((c: any) => c.included).length;
  const totalCount = checklist.length;
  const pct = totalCount > 0 ? Math.round((readyCount / totalCount) * 100) : 0;

  const stateRules: Array<{ code: string; message: string; severity: string }> = data.stateRules || [];
  const tipAdj = data.tipAdjustments || {};
  const stateTax = data.stateTaxEstimate || {};
  const stateInfo = data.stateInfo || {};
  const filingComponents: string[] = data.filingComponents || [];

  const bucketColors: Record<string, string> = {
    None: "bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-700",
    Flat: "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 border-green-200 dark:border-green-700",
    Graduated: "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 border-yellow-200 dark:border-yellow-700",
    Decoupled: "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 border-red-200 dark:border-red-700",
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.55 }}
      className="mt-6"
    >
      <Card data-testid="card-submission-readiness">
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Gauge className="h-4 w-4" />
            Filing Readiness
          </CardTitle>
          <Badge
            variant={pct === 100 ? "default" : "secondary"}
            data-testid="badge-readiness-score"
          >
            {pct}%
          </Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          <Progress value={pct} className="h-2" data-testid="progress-readiness" />

          {stateInfo.stateCode && (
            <div className={`flex items-center justify-between p-3 rounded-md border ${bucketColors[stateInfo.taxType] || "bg-muted/50"}`} data-testid="state-bucket-banner">
              <div className="flex items-center gap-2 min-w-0">
                <MapPin className="h-4 w-4 shrink-0" />
                <div>
                  <p className="text-sm font-medium" data-testid="text-state-name">{stateInfo.stateName} ({stateInfo.stateCode})</p>
                  <p className="text-xs opacity-80" data-testid="text-bucket-label">{stateInfo.bucketLabel}</p>
                </div>
              </div>
              {stateTax.estimate > 0 && (
                <div className="text-right shrink-0 ml-2">
                  <p className="text-sm font-bold" data-testid="text-state-tax-amount">${Number(stateTax.estimate).toLocaleString("en-US", { minimumFractionDigits: 2 })}</p>
                  <p className="text-xs opacity-70">{stateTax.effectiveRate}% effective</p>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {checklist.map((item: any, i: number) => (
              <div
                key={i}
                className="flex items-start gap-2 text-sm"
                data-testid={`readiness-item-${i}`}
              >
                {item.included ? (
                  <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                )}
                <div className="min-w-0">
                  <span className={item.included ? "text-foreground" : "text-muted-foreground"}>
                    {item.label}
                  </span>
                  {item.description && (
                    <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {filingComponents.length > 0 && (
            <div className="pt-2 border-t">
              <p className="text-xs font-medium text-muted-foreground mb-1.5">$50 Filing Bundle Includes:</p>
              <div className="flex flex-wrap gap-1.5">
                {filingComponents.map((comp: string, i: number) => (
                  <Badge key={i} variant="outline" className="text-xs" data-testid={`filing-component-${i}`}>
                    {comp}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {tipAdj.noTaxOnTipsApplied && (
            <div className="flex items-start gap-2 p-2 rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800" data-testid="tip-adjustment-info">
              <Info className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
              <div className="text-xs">
                <p className="font-medium text-green-800 dark:text-green-300">No Tax on Tips (2026 OBBBA)</p>
                <p className="text-green-700/80 dark:text-green-400/70 mt-0.5">
                  Federal tip income exemption applied.
                  {tipAdj.stateDecoupled && " Your state has decoupled — state taxes still apply on tip income."}
                </p>
              </div>
            </div>
          )}

          {stateInfo.requiresStateAdjustment && (
            <div className="flex items-start gap-2 p-2 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800" data-testid="state-adjustment-warning">
              <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
              <div className="text-xs">
                <p className="font-medium text-red-800 dark:text-red-300">State Adjustment Required</p>
                <p className="text-red-700/80 dark:text-red-400/70 mt-0.5">
                  {stateInfo.stateName} has decoupled from federal rules. You will be asked about vehicle depreciation and Section 179 deductions during finalization.
                </p>
              </div>
            </div>
          )}

          {stateRules.length > 0 && (
            <div className="space-y-1.5 pt-2 border-t">
              {stateRules.map((rule: any, i: number) => (
                <div
                  key={i}
                  className={`flex items-start gap-2 text-xs p-2 rounded-md ${
                    rule.severity === "action"
                      ? "bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800"
                      : rule.severity === "warning"
                        ? "bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800"
                        : "bg-muted/50"
                  }`}
                  data-testid={`state-rule-${i}`}
                >
                  {rule.severity === "action" ? (
                    <Info className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                  ) : rule.severity === "warning" ? (
                    <AlertTriangle className="h-3.5 w-3.5 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" />
                  ) : (
                    <Info className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                  )}
                  <span>{rule.message}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

function FreeRetentionAlert({ user }: { user: User | null | undefined }) {
  if (!user) return null;

  const referenceDate = user.lastLoginAt
    ? new Date(user.lastLoginAt)
    : user.createdAt
      ? new Date(user.createdAt)
      : null;

  if (!referenceDate) return null;

  const daysSinceActivity = differenceInDays(new Date(), referenceDate);
  const daysRemaining = Math.max(0, 90 - daysSinceActivity);

  if (daysSinceActivity < 60) {
    return (
      <Card className="border-yellow-500/40 bg-yellow-50/50 dark:bg-yellow-900/10 mb-2" data-testid="banner-free-tier">
        <CardContent className="flex items-start gap-3 py-3 px-4">
          <Shield className="h-5 w-5 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-yellow-800 dark:text-yellow-300">
              Free Tier: Your tax data is stored for 90 days.
            </p>
            <p className="text-xs text-yellow-700/80 dark:text-yellow-400/70 mt-0.5">
              Upgrade to Pro for 7-year IRS-compliant storage with the Tax Vault, plus segment-aware vault tips.
            </p>
          </div>
          <Link href="/upgrade">
            <Button variant="outline" size="sm" className="shrink-0 border-yellow-500/50 text-yellow-700 dark:text-yellow-300" data-testid="button-upgrade-pro">
              Learn More
            </Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  const isCritical = daysRemaining <= 10;

  return (
    <Alert
      variant="destructive"
      className={
        isCritical
          ? "border-destructive bg-destructive/10 dark:bg-destructive/20 mb-2"
          : "border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20 dark:border-yellow-600 mb-2 [&>svg]:text-yellow-600 dark:[&>svg]:text-yellow-400 text-yellow-900 dark:text-yellow-200"
      }
      data-testid="alert-retention-countdown"
    >
      {isCritical ? (
        <AlertTriangle className="h-5 w-5" />
      ) : (
        <Clock className="h-5 w-5" />
      )}
      <AlertTitle className="flex items-center gap-2 flex-wrap">
        Free Tier Storage: Your data is scheduled for cleanup in {daysRemaining} day{daysRemaining !== 1 ? "s" : ""}.
      </AlertTitle>
      <AlertDescription className="mt-1">
        <p className="text-sm">
          {isCritical
            ? "Your tax records, mileage logs, and expense data will be permanently deleted soon. Act now to preserve your records."
            : "Upgrade to Pro for permanent IRS-compliant storage. Pro members get 7-year Tax Vault retention, unlimited receipt photos, and certified audit-ready exports."}
        </p>
        <div className="flex gap-3 mt-3 flex-wrap">
          <Link href="/upgrade">
            <Button
              variant={isCritical ? "default" : "outline"}
              size="sm"
              data-testid="button-upgrade-pro-alert"
            >
              Upgrade to Pro
            </Button>
          </Link>
        </div>
      </AlertDescription>
    </Alert>
  );
}

function FinalizeSubmissionSection({ summary }: { summary: TaxSummary }) {
  const [, navigate] = useLocation();
  const [modalOpen, setModalOpen] = useState(false);
  const [ack1099k, setAck1099k] = useState(false);
  const [ackFigures, setAckFigures] = useState(false);
  const [ackBookkeeping, setAckBookkeeping] = useState(false);
  const [ackStateVerified, setAckStateVerified] = useState(false);
  const [perjuryAccepted, setPerjuryAccepted] = useState(false);
  const [selfSelectPin, setSelfSelectPin] = useState("");
  const [validating, setValidating] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [validationResult, setValidationResult] = useState<any>(null);
  const [finalizeResult, setFinalizeResult] = useState<any>(null);
  const [finalizeError, setFinalizeError] = useState<string | null>(null);
  const [stateAdjustmentAck, setStateAdjustmentAck] = useState(false);
  const [boughtNewVehicle, setBoughtNewVehicle] = useState(false);
  const [affidavitAccepted, setAffidavitAccepted] = useState(false);

  const { data: readinessData } = useQuery<any>({ queryKey: ["/api/submission-readiness"] });
  const stateInfo = readinessData?.stateInfo || {};
  const requiresStateAdjustment = stateInfo?.requiresStateAdjustment || false;

  const allChecked = ack1099k && ackFigures && ackBookkeeping && ackStateVerified && perjuryAccepted && affidavitAccepted
    && (!requiresStateAdjustment || stateAdjustmentAck);
  const pinValid = /^\d{5}$/.test(selfSelectPin);
  const canSubmit = allChecked && pinValid && validationResult?.valid && !finalizing;
  const taxYear = new Date().getFullYear();

  const preflightChecks = validationResult?.preflightChecks || [];
  const preflightScore = validationResult?.preflightScore || 0;

  function resetModal() {
    setAck1099k(false);
    setAckFigures(false);
    setAckBookkeeping(false);
    setAckStateVerified(false);
    setPerjuryAccepted(false);
    setSelfSelectPin("");
    setValidationResult(null);
    setFinalizeResult(null);
    setFinalizeError(null);
    setStateAdjustmentAck(false);
    setBoughtNewVehicle(false);
    setAffidavitAccepted(false);
  }

  async function handleOpenModal() {
    resetModal();
    setModalOpen(true);
    setValidating(true);
    try {
      const res = await apiRequest("POST", "/api/submissions/validate");
      const data = await res.json();
      setValidationResult(data);
    } catch {
      setValidationResult({ valid: false, errors: [{ message: "Could not validate. Try again." }], warnings: [], preflightScore: 0, preflightChecks: [] });
    } finally {
      setValidating(false);
    }
  }

  async function handleFinalize() {
    setFinalizing(true);
    setFinalizeError(null);
    try {
      const res = await apiRequest("POST", "/api/submissions/finalize", {
        taxYear,
        selfSelectPin,
        ack_1099k_verified: ack1099k,
        ack_figures_reviewed: ackFigures,
        ack_bookkeeping_tool: ackBookkeeping,
        ackStateVerified,
        perjury_accepted: perjuryAccepted,
        affidavitAccepted,
        filingStateCode: stateInfo.stateCode || null,
        filingStateBucket: stateInfo.taxType || null,
        stateAdjustmentAck: requiresStateAdjustment ? stateAdjustmentAck : undefined,
        boughtNewVehicle: requiresStateAdjustment ? boughtNewVehicle : undefined,
      });
      if (!res.ok) {
        const errData = await res.json();
        setFinalizeError(errData.message || "Finalization failed.");
        return;
      }
      const data = await res.json();
      setFinalizeResult(data);
    } catch {
      setFinalizeError("An unexpected error occurred during finalization.");
    } finally {
      setFinalizing(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.6 }}
      className="mt-4"
    >
      <Card className="border-primary/30 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Finalize & Lock Submission
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-2 p-3 rounded-md bg-primary/5 border border-primary/20">
            <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <p className="text-xs text-foreground/80 leading-relaxed">
              Finalizing runs a Pre-Flight Check, requires your e-signature (5-digit PIN), and permanently locks this tax year. Your return will be marked as "Self-Prepared" with MCTUSA as Electronic Return Originator (ERO).
            </p>
          </div>

          <Button
            onClick={handleOpenModal}
            data-testid="button-finalize-submission"
          >
            <Shield className="h-4 w-4 mr-2" />
            Begin Pre-Flight Check
          </Button>

          {modalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" data-testid="modal-finalize-submission">
              <div className="bg-background border border-border rounded-md w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto shadow-lg">
                <div className="p-6 space-y-5">
                  <div className="text-center space-y-2">
                    <Shield className="h-8 w-8 text-primary mx-auto" />
                    <h2 className="text-xl font-bold" data-testid="text-finalize-title">
                      Pre-Flight Check — Tax Year {taxYear}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      Self-Prepared Return | MCTUSA as Electronic Return Originator (ERO)
                    </p>
                  </div>

                  {validating && (
                    <div className="flex items-center justify-center gap-2 py-4">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      <span className="text-sm text-muted-foreground">Running pre-flight validation...</span>
                    </div>
                  )}

                  {validationResult && !finalizeResult && (
                    <>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium">Pre-Flight Progress</span>
                          <span className="text-sm font-bold" data-testid="text-preflight-score">{preflightScore}%</span>
                        </div>
                        <Progress value={preflightScore} className="h-2" data-testid="progress-preflight" />

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {preflightChecks.map((check: any, i: number) => (
                            <div key={i} className="flex items-center gap-2 p-2 rounded-md border border-border/60">
                              {check.passed ? (
                                <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
                              ) : (
                                <XCircle className="h-4 w-4 text-destructive shrink-0" />
                              )}
                              <span className="text-xs" data-testid={`text-preflight-check-${i}`}>{check.label}</span>
                              {check.required && !check.passed && (
                                <Badge variant="destructive" className="ml-auto text-[10px]">Required</Badge>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      {validationResult.errors?.length > 0 && (
                        <div className="p-3 rounded-md bg-destructive/10 border border-destructive/30 space-y-1">
                          <p className="text-sm font-medium text-destructive" data-testid="text-validation-errors-title">Blocking Errors (must fix)</p>
                          {validationResult.errors.map((e: any, i: number) => (
                            <p key={i} className="text-xs text-destructive/80" data-testid={`text-validation-error-${i}`}>
                              {e.message}
                            </p>
                          ))}
                        </div>
                      )}
                      {validationResult.warnings?.length > 0 && (
                        <div className="p-3 rounded-md bg-yellow-500/10 border border-yellow-500/30 space-y-1">
                          <p className="text-sm font-medium text-yellow-700 dark:text-yellow-400">Warnings (review recommended)</p>
                          {validationResult.warnings.map((w: any, i: number) => (
                            <p key={i} className="text-xs text-yellow-600 dark:text-yellow-300" data-testid={`text-validation-warning-${i}`}>
                              {w.message}
                            </p>
                          ))}
                        </div>
                      )}
                      {validationResult.valid && validationResult.errors?.length === 0 && (
                        <div className="p-3 rounded-md bg-green-500/10 border border-green-500/30">
                          <p className="text-sm font-medium text-green-700 dark:text-green-400" data-testid="text-validation-passed">
                            All pre-flight checks passed. Ready to sign and submit.
                          </p>
                        </div>
                      )}

                      {validationResult.valid && (
                        <>
                          <div className="p-4 rounded-md bg-muted/50 border border-border space-y-1">
                            <p className="text-sm font-semibold" data-testid="text-perjury-statement-label">Legal Statement</p>
                            <p className="text-xs text-foreground/80 leading-relaxed italic" data-testid="text-perjury-statement">
                              Under penalties of perjury, I declare that I have examined this return and accompanying schedules and statements, and to the best of my knowledge and belief, they are true, correct, and complete.
                            </p>
                          </div>

                          <div className="space-y-4 pt-2">
                            <div className="flex items-start gap-3">
                              <Checkbox
                                id="finalize-ack-1099k"
                                checked={ack1099k}
                                onCheckedChange={(c) => setAck1099k(c === true)}
                                data-testid="checkbox-finalize-1099k"
                              />
                              <Label htmlFor="finalize-ack-1099k" className="text-xs leading-snug cursor-pointer">
                                I have verified my 1099-K Gross Income matches my platform records.
                              </Label>
                            </div>
                            <div className="flex items-start gap-3">
                              <Checkbox
                                id="finalize-ack-figures"
                                checked={ackFigures}
                                onCheckedChange={(c) => setAckFigures(c === true)}
                                data-testid="checkbox-finalize-figures"
                              />
                              <Label htmlFor="finalize-ack-figures" className="text-xs leading-snug cursor-pointer">
                                I have reviewed all auto-calculated figures and confirm they are accurate.
                              </Label>
                            </div>
                            <div className="flex items-start gap-3">
                              <Checkbox
                                id="finalize-ack-bookkeeping"
                                checked={ackBookkeeping}
                                onCheckedChange={(c) => setAckBookkeeping(c === true)}
                                data-testid="checkbox-finalize-bookkeeping"
                              />
                              <Label htmlFor="finalize-ack-bookkeeping" className="text-xs leading-snug cursor-pointer">
                                I understand that MCTUSA is a bookkeeping tool and I am the sole person responsible for this submission.
                              </Label>
                            </div>
                            <div className="flex items-start gap-3">
                              <Checkbox
                                id="finalize-ack-state"
                                checked={ackStateVerified}
                                onCheckedChange={(c) => setAckStateVerified(c === true)}
                                data-testid="checkbox-finalize-state"
                              />
                              <Label htmlFor="finalize-ack-state" className="text-xs leading-snug cursor-pointer">
                                {stateInfo.stateCode
                                  ? `I verify that my filing state is ${stateInfo.stateName} (${stateInfo.stateCode}) — ${stateInfo.bucketLabel}.`
                                  : "I verify my filing state jurisdiction is correct."}
                              </Label>
                            </div>
                            <div className="flex items-start gap-3">
                              <Checkbox
                                id="finalize-perjury"
                                checked={perjuryAccepted}
                                onCheckedChange={(c) => setPerjuryAccepted(c === true)}
                                data-testid="checkbox-finalize-perjury"
                              />
                              <Label htmlFor="finalize-perjury" className="text-xs leading-snug cursor-pointer">
                                I accept the perjury statement above and understand the legal implications.
                              </Label>
                            </div>
                            <div className="flex items-start gap-3">
                              <Checkbox
                                id="finalize-affidavit"
                                checked={affidavitAccepted}
                                onCheckedChange={(c) => setAffidavitAccepted(c === true)}
                                data-testid="checkbox-finalize-affidavit"
                              />
                              <Label htmlFor="finalize-affidavit" className="text-xs leading-snug cursor-pointer">
                                I affirm under penalty of perjury that I am a bona fide resident of {stateInfo.stateName || "my filing state"} as of December 31, {taxYear}, and that the state and local tax information herein is true and correct.
                              </Label>
                            </div>
                          </div>

                          {requiresStateAdjustment && (
                            <div className="space-y-3 p-3 rounded-md border bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
                              <div className="flex items-start gap-2">
                                <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                                <div className="text-xs">
                                  <p className="font-medium text-red-800 dark:text-red-300">{stateInfo.stateName} State Adjustment</p>
                                  <p className="text-red-700/80 dark:text-red-400/70 mt-1">
                                    {stateInfo.stateName} has decoupled from certain federal deduction rules. Please answer the following to ensure your state filing is accurate.
                                  </p>
                                </div>
                              </div>
                              <div className="space-y-2 pl-6">
                                <div className="flex items-start gap-3">
                                  <Checkbox
                                    id="finalize-bought-vehicle"
                                    checked={boughtNewVehicle}
                                    onCheckedChange={(c) => setBoughtNewVehicle(c === true)}
                                    data-testid="checkbox-bought-vehicle"
                                  />
                                  <Label htmlFor="finalize-bought-vehicle" className="text-xs leading-snug cursor-pointer">
                                    I purchased a new vehicle this tax year and claimed Section 179 or bonus depreciation.
                                  </Label>
                                </div>
                                <div className="flex items-start gap-3">
                                  <Checkbox
                                    id="finalize-state-adj-ack"
                                    checked={stateAdjustmentAck}
                                    onCheckedChange={(c) => setStateAdjustmentAck(c === true)}
                                    data-testid="checkbox-state-adjustment-ack"
                                  />
                                  <Label htmlFor="finalize-state-adj-ack" className="text-xs leading-snug cursor-pointer">
                                    I understand that {stateInfo.stateName} may require separate depreciation schedules and my state deductions may differ from federal.
                                  </Label>
                                </div>
                              </div>
                            </div>
                          )}

                          <div className="space-y-2 pt-2">
                            <Label htmlFor="self-select-pin" className="text-sm font-medium flex items-center gap-2">
                              <Lock className="h-4 w-4" />
                              E-Signature: 5-Digit Self-Select PIN
                            </Label>
                            <p className="text-xs text-muted-foreground">
                              Enter a 5-digit PIN to electronically sign this submission. This serves as your digital signature.
                            </p>
                            <Input
                              id="self-select-pin"
                              type="password"
                              inputMode="numeric"
                              maxLength={5}
                              placeholder="Enter 5-digit PIN"
                              value={selfSelectPin}
                              onChange={(e) => setSelfSelectPin(e.target.value.replace(/\D/g, "").slice(0, 5))}
                              className="max-w-[200px] font-mono tracking-widest text-center"
                              data-testid="input-self-select-pin"
                            />
                            {selfSelectPin.length > 0 && !pinValid && (
                              <p className="text-xs text-destructive">PIN must be exactly 5 digits</p>
                            )}
                          </div>
                        </>
                      )}
                    </>
                  )}

                  {finalizeError && (
                    <div className="p-3 rounded-md bg-destructive/10 border border-destructive/30">
                      <p className="text-xs text-destructive" data-testid="text-finalize-error">{finalizeError}</p>
                    </div>
                  )}

                  {finalizeResult && (
                    <SubmissionSuccess
                      taxYear={finalizeResult.taxYear}
                      filingId={finalizeResult.filingId}
                      submissionHash={finalizeResult.submissionHash}
                      variant="finalize"
                      onClose={() => { setModalOpen(false); resetModal(); }}
                      onGoToExport={() => { setModalOpen(false); resetModal(); navigate("/export"); }}
                    />
                  )}

                  {!finalizeResult && (
                    <div className="flex justify-end gap-2 pt-2">
                      <Button
                        variant="outline"
                        onClick={() => { setModalOpen(false); resetModal(); }}
                        data-testid="button-finalize-cancel"
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleFinalize}
                        disabled={!canSubmit}
                        data-testid="button-finalize-confirm"
                      >
                        {finalizing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                        {finalizing ? "Signing & Submitting..." : "Submit and Pay"}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

function ExportSection({ summary, mileageLogs }: { summary: TaxSummary; mileageLogs: MileageLog[] }) {
  const [disclaimerOpen, setDisclaimerOpen] = useState(false);
  const [scrolledToBottom, setScrolledToBottom] = useState(false);
  const [ack1, setAck1] = useState(false);
  const [ack2, setAck2] = useState(false);
  const [ack3, setAck3] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [submittingToVault, setSubmittingToVault] = useState(false);
  const [vaultSuccess, setVaultSuccess] = useState(false);

  const allAcknowledged = ack1 && ack2 && ack3 && scrolledToBottom;

  function resetDisclaimer() {
    setScrolledToBottom(false);
    setAck1(false);
    setAck2(false);
    setAck3(false);
    setVaultSuccess(false);
  }

  function handleDisclaimerScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 30) {
      setScrolledToBottom(true);
    }
  }

  async function logDisclaimerAcceptance(action: string) {
    try {
      await apiRequest("POST", "/api/audit-log", {
        action,
        metadata: {
          ack_not_tax_advice: true,
          ack_self_prepared: true,
          ack_circular_230: true,
          scrolled_to_bottom: true,
          grossIncome: summary.grossIncome,
          netProfit: summary.netProfit,
        },
      });
    } catch {}
  }

  async function handleSubmitToVault() {
    setSubmittingToVault(true);
    try {
      await logDisclaimerAcceptance("submission.disclaimer_accepted");
      const res = await apiRequest("POST", "/api/submissions/generate", { provider: "vault_pdf" });
      const data = await res.json();
      if (data.success) {
        setVaultSuccess(true);
      }
    } catch {
    } finally {
      setSubmittingToVault(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      await logDisclaimerAcceptance("export.disclaimer_accepted");
      const now = new Date();
      const dateStr = format(now, "yyyy-MM-dd");
      const zip = new JSZip();

      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      let y = 20;
      const lm = 20;
      const col2 = 130;

      const addLine = (text: string, fontSize = 10, bold = false) => {
        doc.setFontSize(fontSize);
        doc.setFont("helvetica", bold ? "bold" : "normal");
        doc.text(text, lm, y);
        y += fontSize * 0.5 + 2;
      };
      const addRow = (label: string, value: string) => {
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.text(label, lm + 4, y);
        doc.text(value, col2, y, { align: "left" });
        y += 6;
      };
      const addSep = () => {
        doc.setDrawColor(180);
        doc.line(lm, y, pageWidth - lm, y);
        y += 4;
      };

      doc.setFontSize(8);
      doc.setTextColor(200, 0, 0);
      doc.text("*** SELF-PREPARED / NOT AUDITED ***", pageWidth / 2, 12, { align: "center" });
      doc.setTextColor(0);

      addLine("MY CAB TAX USA", 16, true);
      addLine("Schedule C - Profit or Loss from Business (Summary)", 11, false);
      addLine(`Generated: ${format(now, "MMMM d, yyyy 'at' h:mm a")}`, 8);
      y += 2;
      addSep();

      addLine("PART I - INCOME", 11, true);
      addRow("Line 1  Gross Receipts:", `$${summary.grossIncome.toFixed(2)}`);
      addRow("Line 10  Commissions & Fees:", `-$${summary.totalPlatformFees.toFixed(2)}`);

      if (Object.keys(summary.incomeBySource).length > 0) {
        y += 2;
        addLine("Income by Source:", 9, true);
        Object.entries(summary.incomeBySource).forEach(([src, val]) => {
          addRow(`  ${src}`, `$${Number(val).toFixed(2)}`);
        });
      }
      y += 2;
      addSep();

      addLine("PART II - EXPENSES", 11, true);
      addRow(`Mileage (${summary.totalMiles.toLocaleString()} mi x $${summary.mileageRate}/mi):`, `-$${summary.mileageDeduction.toFixed(2)}`);
      addRow("Other Deductible Expenses:", `-$${summary.totalOtherExpenses.toFixed(2)}`);
      doc.setFont("helvetica", "bold");
      addRow("Total Deductions:", `-$${summary.totalDeductions.toFixed(2)}`);

      if (Object.keys(summary.expensesByCategory).length > 0) {
        y += 2;
        addLine("Expenses by IRS Category:", 9, true);
        Object.entries(summary.expensesByCategory).forEach(([cat, val]) => {
          addRow(`  ${cat}`, `$${Number(val).toFixed(2)}`);
        });
      }
      y += 2;
      addSep();

      addLine("PART III - NET PROFIT & SELF-EMPLOYMENT TAX", 11, true);
      doc.setFont("helvetica", "bold");
      addRow("Line 31  Net Profit (Loss):", `$${summary.netProfit.toFixed(2)}`);
      doc.setFont("helvetica", "normal");
      y += 2;
      addRow("SE Taxable Base (92.35%):", `$${summary.seTaxableBase.toFixed(2)}`);
      addRow("Self-Employment Tax (15.3%):", `$${summary.selfEmploymentTax.toFixed(2)}`);
      addRow("SE Deduction (50% of SE Tax):", `$${summary.seDeduction.toFixed(2)}`);
      y += 2;
      doc.setFont("helvetica", "bold");
      addRow("RESERVED FOR TAXES:", `$${summary.selfEmploymentTax.toFixed(2)}`);
      addRow("Est. Quarterly Payment:", `$${summary.estimatedQuarterlyPayment.toFixed(2)}`);
      doc.setFont("helvetica", "normal");
      y += 2;
      addSep();

      addLine("QUARTERLY ESTIMATED TAX DEADLINES (2026)", 10, true);
      summary.quarterlyDeadlines.forEach((d, i) => {
        addRow(`Q${i + 1}: ${format(parseISO(d), "MMMM d, yyyy")}`, `$${summary.estimatedQuarterlyPayment.toFixed(2)}`);
      });
      y += 4;
      addSep();

      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      const disclaimer = [
        "CERTIFICATION: I certify under penalty of perjury that the information provided is true and correct to the best of my knowledge.",
        "I acknowledge that My Cab Tax USA is a tool and not a tax professional.",
        "",
        "IRS CIRCULAR 230 DISCLOSURE: To ensure compliance with requirements imposed by the IRS,",
        "we inform you that any tax advice contained in this document was not intended or written to be used,",
        "and cannot be used, for the purpose of (i) avoiding penalties under the Internal Revenue Code",
        "or (ii) promoting, marketing, or recommending to another party any transaction or matter addressed herein.",
        "",
        "DISCLAIMER: This is a bookkeeping summary only. It is NOT a tax return.",
        "Consult a qualified CPA or Tax Attorney before submitting any returns to the IRS.",
        "",
        "This document was generated by My Cab Tax USA, a bookkeeping tool.",
        "It has not been reviewed, verified, or audited by the IRS or any licensed tax professional.",
        "Jurisdiction: State of Delaware.",
      ];
      disclaimer.forEach(line => {
        doc.text(line, lm, y);
        y += 4;
      });

      doc.setFontSize(8);
      doc.setTextColor(200, 0, 0);
      doc.text("*** SELF-PREPARED / NOT AUDITED ***", pageWidth / 2, y + 4, { align: "center" });

      zip.file("Schedule_C_Summary.pdf", doc.output("arraybuffer"));

      const categoryCsvRows = [
        ["Category", "Amount"],
        ...Object.entries(summary.expensesByCategory).map(([cat, val]) => [cat, Number(val).toFixed(2)]),
      ];
      if (Object.keys(summary.incomeBySource).length > 0) {
        categoryCsvRows.push([]);
        categoryCsvRows.push(["Income Source", "Amount"]);
        Object.entries(summary.incomeBySource).forEach(([src, val]) => {
          categoryCsvRows.push([src, Number(val).toFixed(2)]);
        });
      }
      categoryCsvRows.push([]);
      categoryCsvRows.push(["Total Gross Income", summary.grossIncome.toFixed(2)]);
      categoryCsvRows.push(["Total Deductions", summary.totalDeductions.toFixed(2)]);
      categoryCsvRows.push(["Net Profit", summary.netProfit.toFixed(2)]);
      categoryCsvRows.push(["Self-Employment Tax", summary.selfEmploymentTax.toFixed(2)]);
      categoryCsvRows.push(["Est. Quarterly Payment", summary.estimatedQuarterlyPayment.toFixed(2)]);
      zip.file(`Expenses_By_Category_${dateStr}.csv`, categoryCsvRows.map(r => (r as string[]).join(",")).join("\n"));

      const csvEscape = (val: string) => {
        if (val.includes(",") || val.includes('"') || val.includes("\n")) {
          return `"${val.replace(/"/g, '""')}"`;
        }
        return val;
      };
      const mileageCsvRows = [
        ["Date", "Business Purpose", "Total Miles", "Start Odometer", "End Odometer", "Deduction"],
        ...mileageLogs
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
          .map(log => [
            log.date,
            csvEscape(log.businessPurpose),
            Number(log.totalMiles).toFixed(1),
            log.startOdometer ? Number(log.startOdometer).toString() : "",
            log.endOdometer ? Number(log.endOdometer).toString() : "",
            (Number(log.totalMiles) * IRS_MILEAGE_RATE).toFixed(2),
          ]),
      ];
      if (mileageLogs.length > 0) {
        const totalLogMiles = mileageLogs.reduce((s, l) => s + Number(l.totalMiles), 0);
        mileageCsvRows.push(["TOTAL", "", totalLogMiles.toFixed(1), "", "", (totalLogMiles * IRS_MILEAGE_RATE).toFixed(2)]);
      }
      zip.file("MileageLog.csv", mileageCsvRows.map(r => r.join(",")).join("\n"));

      const receiptsFolder = zip.folder("Receipts");
      try {
        const receiptsRes = await fetch("/api/receipts", { credentials: "include" });
        if (receiptsRes.ok) {
          const receiptsList = await receiptsRes.json();
          const imagePromises = receiptsList.map(async (r: any, idx: number) => {
            try {
              const imageUrl = r.signedImageUrl || r.imageUrl;
              if (!imageUrl) return;
              const imgRes = await fetch(imageUrl);
              if (imgRes.ok) {
                const imgBlob = await imgRes.blob();
                const ext = r.originalFilename?.split(".").pop() || "jpg";
                const safeDate = r.receiptDate || r.createdAt?.split("T")[0] || "unknown";
                const safeMerchant = (r.merchantName || "receipt").replace(/[^a-zA-Z0-9]/g, "_").substring(0, 30);
                const filename = `${safeDate}_${safeMerchant}_${idx + 1}.${ext}`;
                receiptsFolder?.file(filename, imgBlob);
              }
            } catch {}
          });
          await Promise.allSettled(imagePromises);
        }
      } catch {}

      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `MyCabTax_Export_${dateStr}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
      setDisclaimerOpen(false);
      resetDisclaimer();
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5 }}
      className="mt-8"
    >
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Download className="h-5 w-5 text-primary" />
              Export Center
            </CardTitle>
            <Badge variant="secondary" className="text-xs no-default-active-elevate hidden lg:inline-flex">
              Desktop Bookkeeping Suite
            </Badge>
          </div>
          <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/5 border border-destructive/20 mt-2">
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <p className="text-xs text-foreground/80 leading-relaxed">
              Exports are for your personal records only. Not a tax return. Always review with a qualified CPA or Tax Attorney before filing with the IRS.
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Desktop: prominent action cards in a row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <button
              onClick={() => { resetDisclaimer(); setDisclaimerOpen(true); }}
              className="flex flex-col items-start gap-2 p-4 rounded-xl border-2 border-primary/30 bg-primary/5 hover:bg-primary/10 hover:border-primary/60 transition-all text-left cursor-pointer group"
              data-testid="button-export-summary"
            >
              <div className="p-2 rounded-lg bg-primary/15 group-hover:bg-primary/25 transition-colors">
                <Download className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-sm">Download Tax Pack</p>
                <p className="text-xs text-muted-foreground mt-0.5">PDF + CSV schedule C — IRS ready</p>
              </div>
            </button>

            <Link href="/export">
              <div className="flex flex-col items-start gap-2 p-4 rounded-xl border-2 border-border/60 bg-card hover:bg-muted/40 hover:border-border transition-all text-left cursor-pointer group h-full">
                <div className="p-2 rounded-lg bg-muted group-hover:bg-muted/80 transition-colors">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-semibold text-sm">Full Export Page</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Multi-year summaries &amp; CSV downloads</p>
                </div>
              </div>
            </Link>

            <button
              onClick={() => { resetDisclaimer(); setDisclaimerOpen(true); }}
              className="flex flex-col items-start gap-2 p-4 rounded-xl border-2 border-border/60 bg-card hover:bg-muted/40 hover:border-border transition-all text-left cursor-pointer group"
              data-testid="button-export-vault"
            >
              <div className="p-2 rounded-lg bg-muted group-hover:bg-muted/80 transition-colors">
                <Shield className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="font-semibold text-sm">Save to Tax Vault</p>
                <p className="text-xs text-muted-foreground mt-0.5">Signed PDF stored for 7 years</p>
              </div>
            </button>
          </div>

          <AlertDialog open={disclaimerOpen} onOpenChange={(open) => { if (!open) { setDisclaimerOpen(false); resetDisclaimer(); } }}>
            <AlertDialogContent className="sm:max-w-xl" onPointerDownOutside={(e) => e.preventDefault()}>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2" data-testid="text-export-disclaimer-title">
                  <Shield className="h-5 w-5 text-destructive" />
                  Mandatory Legal Disclaimer
                </AlertDialogTitle>
              </AlertDialogHeader>

              <div
                className="max-h-[300px] overflow-y-auto border rounded-md p-4 text-xs leading-relaxed text-foreground/80 space-y-3"
                onScroll={handleDisclaimerScroll}
                data-testid="container-disclaimer-scroll"
              >
                <p className="font-bold text-destructive text-sm">IRS CIRCULAR 230 DISCLOSURE</p>
                <p>
                  To ensure compliance with requirements imposed by the IRS, we inform you that any U.S. federal tax advice contained in this communication (including any attachments) was not intended or written to be used, and cannot be used, for the purpose of (i) avoiding penalties under the Internal Revenue Code or (ii) promoting, marketing, or recommending to another party any transaction or matter addressed herein.
                </p>

                <p className="font-bold text-sm pt-2">NOT TAX ADVICE</p>
                <p>
                  My Cab Tax USA is a bookkeeping tool, NOT a tax advisory service. We do not provide professional tax, legal, or accounting advice. This software is designed for informational and organizational purposes only. The calculations and estimates provided are approximate and should not be relied upon as a substitute for professional tax advice. You should consult with a qualified CPA or Tax Attorney before submitting any returns to the IRS.
                </p>

                <p className="font-bold text-sm pt-2">LIMITATION OF LIABILITY</p>
                <p>
                  The Service is provided "as is" and "as available." To the maximum extent permitted by law, My Cab Tax USA disclaims all warranties, express or implied. In no event shall My Cab Tax USA be liable for any indirect, incidental, special, consequential, or punitive damages, or any loss of profits or revenues, arising out of or related to your use of the Service.
                </p>

                <p className="font-bold text-sm pt-2">SELF-PREPARED RECORDS</p>
                <p>
                  This export has NOT been reviewed, verified, or audited by the IRS or any licensed tax professional. All figures are self-reported by the user. You are solely responsible for the accuracy of all data entered. Any errors, omissions, or discrepancies in your tax records are your responsibility.
                </p>

                <p className="font-bold text-sm pt-2">DATA RETENTION & JURISDICTION</p>
                <p>
                  This service operates under the jurisdiction of the State of Delaware, USA. All disputes shall be resolved through binding arbitration in accordance with our Terms of Service. Data retention policies apply based on your subscription tier.
                </p>

                <p className="font-bold text-sm pt-2">CERTIFICATION REQUIREMENT</p>
                <p>
                  By proceeding with this export, you certify under penalty of perjury that the information you have entered into My Cab Tax USA is true, correct, and complete to the best of your knowledge and belief. You acknowledge that this certification is being made voluntarily and that you understand the consequences of filing false or misleading information with the IRS.
                </p>
              </div>

              {!scrolledToBottom && (
                <p className="text-xs text-muted-foreground text-center" data-testid="text-scroll-hint">
                  Scroll to the bottom to continue
                </p>
              )}

              <div className="space-y-3 pt-2">
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="ack-1"
                    checked={ack1}
                    onCheckedChange={(c) => setAck1(c === true)}
                    disabled={!scrolledToBottom}
                    data-testid="checkbox-ack-not-tax-advice"
                  />
                  <Label htmlFor="ack-1" className="text-xs leading-snug cursor-pointer">
                    I understand this is NOT tax advice and My Cab Tax USA is NOT a licensed tax professional.
                  </Label>
                </div>
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="ack-2"
                    checked={ack2}
                    onCheckedChange={(c) => setAck2(c === true)}
                    disabled={!scrolledToBottom}
                    data-testid="checkbox-ack-self-prepared"
                  />
                  <Label htmlFor="ack-2" className="text-xs leading-snug cursor-pointer">
                    I certify under penalty of perjury that all records are accurate and self-prepared.
                  </Label>
                </div>
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="ack-3"
                    checked={ack3}
                    onCheckedChange={(c) => setAck3(c === true)}
                    disabled={!scrolledToBottom}
                    data-testid="checkbox-ack-circular-230"
                  />
                  <Label htmlFor="ack-3" className="text-xs leading-snug cursor-pointer">
                    I have read and acknowledge the IRS Circular 230 Disclosure above.
                  </Label>
                </div>
              </div>

              <AlertDialogFooter className="flex-col sm:flex-row gap-2">
                <AlertDialogCancel onClick={() => { setDisclaimerOpen(false); resetDisclaimer(); }} data-testid="button-export-cancel">
                  Cancel
                </AlertDialogCancel>
                <Button
                  variant="outline"
                  onClick={handleSubmitToVault}
                  disabled={!allAcknowledged || submittingToVault || vaultSuccess}
                  data-testid="button-submit-vault"
                >
                  {submittingToVault ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : vaultSuccess ? <Shield className="h-4 w-4 mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                  {submittingToVault ? "Submitting..." : vaultSuccess ? "Saved to Vault" : "Confirm & Submit to Vault"}
                </Button>
                <Button
                  onClick={handleExport}
                  disabled={!allAcknowledged || exporting}
                  data-testid="button-export-proceed"
                >
                  {exporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                  {exporting ? "Exporting..." : "I Agree - Download Export"}
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function QuarterlyOdometerReminder() {
  const { data: vehicleList, isLoading: vehiclesLoading } = useQuery<any[]>({
    queryKey: ["/api/vehicles"],
  });
  const { data: checkins, isLoading: checkinsLoading } = useQuery<any[]>({
    queryKey: ["/api/odometer-checkins"],
  });

  if (vehiclesLoading || checkinsLoading) return null;
  if (!vehicleList || vehicleList.length === 0) return null;

  const now = new Date();
  const currentQuarter = Math.floor(now.getMonth() / 3) + 1;
  const currentYear = now.getFullYear();

  const hasCheckinThisQuarter = checkins?.some((c: any) => {
    const d = new Date(c.checkinDate);
    return Math.floor(d.getMonth() / 3) + 1 === currentQuarter && d.getFullYear() === currentYear;
  });

  if (hasCheckinThisQuarter) return null;

  return (
    <Alert className="mb-4 border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/20" data-testid="alert-odometer-reminder">
      <Gauge className="h-4 w-4 text-amber-600" />
      <AlertTitle className="text-sm font-medium">Quarterly Odometer Check-In Due</AlertTitle>
      <AlertDescription className="text-xs text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
        <span>Record your current odometer reading to maintain IRS-compliant mileage records (IRC Sec. 274(d)).</span>
        <Link href="/mileage">
          <Button size="sm" variant="outline" data-testid="button-odometer-checkin">
            <Gauge className="mr-1 h-3 w-3" />
            Check In Now
          </Button>
        </Link>
      </AlertDescription>
    </Alert>
  );
}
