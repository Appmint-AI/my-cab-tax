import { useState } from "react";
import { Layout } from "@/components/Layout";
import { useQuery } from "@tanstack/react-query";
import { useSubscription } from "@/hooks/use-subscription";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import {
  FileText,
  Download,
  FileSpreadsheet,
  Archive,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  TrendingUp,
  DollarSign,
  MapPin,
  Receipt,
  Shield,
} from "lucide-react";
import { SubmissionSuccess } from "@/components/SubmissionSuccess";

interface CategoryBreakdown {
  category: string;
  totalSpent: number;
  deductibleAmount: number;
  auditRisk: string;
}

interface ExportSummary {
  taxYear: number;
  grossIncome: number;
  tipIncome: number;
  totalExpenses: number;
  totalDeductions: number;
  totalMiles: number;
  mileageDeduction: number;
  saltTotal: number;
  saltCapped: number;
  categoryBreakdown: CategoryBreakdown[];
  netProfit: number;
  receiptCount: number;
}

function AuditRiskBadge({ risk }: { risk: string }) {
  if (risk === "Low") {
    return (
      <Badge variant="outline" className="no-default-active-elevate text-xs gap-1 border-green-500/30 text-green-700 dark:text-green-400">
        <CheckCircle2 className="h-3 w-3" />
        Low
      </Badge>
    );
  }
  if (risk === "Medium") {
    return (
      <Badge variant="outline" className="no-default-active-elevate text-xs gap-1 border-yellow-500/30 text-yellow-700 dark:text-yellow-400">
        <AlertTriangle className="h-3 w-3" />
        Medium
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="no-default-active-elevate text-xs gap-1 border-red-500/30 text-red-700 dark:text-red-400">
      <XCircle className="h-3 w-3" />
      High
    </Badge>
  );
}

function SuccessModal({ open, onClose, taxYear }: { open: boolean; onClose: () => void; taxYear: number }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[540px] max-h-[90vh] overflow-y-auto" data-testid="dialog-export-success">
        <SubmissionSuccess
          taxYear={taxYear}
          variant="export"
          onClose={onClose}
        />
      </DialogContent>
    </Dialog>
  );
}

export default function ExportPage() {
  const currentYear = new Date().getFullYear();
  const [taxYear, setTaxYear] = useState(String(currentYear));
  const [showSuccess, setShowSuccess] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const { data: subscription } = useSubscription();
  const isPro = subscription?.tier === "pro";

  const { data: summary, isLoading } = useQuery<ExportSummary>({
    queryKey: ["/api/export/summary", taxYear],
    queryFn: async () => {
      const res = await fetch(`/api/export/summary?year=${taxYear}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load summary");
      return res.json();
    },
  });

  const downloadFile = async (endpoint: string, filename: string) => {
    setDownloading(endpoint);
    try {
      const res = await fetch(`${endpoint}?year=${taxYear}`, { credentials: "include" });
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(null);
    }
  };

  const handleBulkExport = async () => {
    setDownloading("bulk");
    try {
      await downloadFile("/api/export/expenses-csv", `MCTUSA_Expenses_${taxYear}.csv`);
      await downloadFile("/api/export/mileage-csv", `MCTUSA_Mileage_${taxYear}.csv`);
      await downloadFile("/api/export/income-csv", `MCTUSA_Income_${taxYear}.csv`);
      setShowSuccess(true);
    } finally {
      setDownloading(null);
    }
  };

  const yearOptions = Array.from({ length: 5 }, (_, i) => String(currentYear - i));

  return (
    <Layout>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold" data-testid="text-export-title">Tax Ready Export</h1>
          <p className="text-muted-foreground">
            Review your data and export IRS-ready reports for your accountant.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Select value={taxYear} onValueChange={setTaxYear}>
            <SelectTrigger className="w-[130px]" data-testid="select-tax-year">
              <SelectValue placeholder="Tax Year" />
            </SelectTrigger>
            <SelectContent>
              {yearOptions.map(y => (
                <SelectItem key={y} value={y}>Tax Year {y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 rounded-lg" />)}
          </div>
          <Skeleton className="h-64 rounded-lg" />
        </div>
      ) : summary ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <Card>
              <CardContent className="py-4 px-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 rounded-md bg-green-500/10">
                    <TrendingUp className="h-4 w-4 text-green-600" />
                  </div>
                  <span className="text-xs text-muted-foreground">Gross Income</span>
                </div>
                <p className="text-2xl font-bold font-mono" data-testid="text-gross-income">
                  ${summary.grossIncome.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </p>
                {summary.tipIncome > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    incl. ${summary.tipIncome.toLocaleString()} tips (tax-exempt)
                  </p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4 px-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 rounded-md bg-red-500/10">
                    <DollarSign className="h-4 w-4 text-red-600" />
                  </div>
                  <span className="text-xs text-muted-foreground">Total Deductions</span>
                </div>
                <p className="text-2xl font-bold font-mono" data-testid="text-total-deductions">
                  ${summary.totalDeductions.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4 px-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 rounded-md bg-blue-500/10">
                    <MapPin className="h-4 w-4 text-blue-600" />
                  </div>
                  <span className="text-xs text-muted-foreground">Mileage Deduction</span>
                </div>
                <p className="text-2xl font-bold font-mono" data-testid="text-mileage-deduction">
                  ${summary.mileageDeduction.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {summary.totalMiles.toLocaleString()} mi at $0.725/mi
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4 px-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 rounded-md bg-purple-500/10">
                    <Receipt className="h-4 w-4 text-purple-600" />
                  </div>
                  <span className="text-xs text-muted-foreground">Net Profit</span>
                </div>
                <p className={`text-2xl font-bold font-mono ${summary.netProfit < 0 ? "text-red-600" : ""}`} data-testid="text-net-profit">
                  ${summary.netProfit.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Schedule C Line 31
                </p>
              </CardContent>
            </Card>
          </div>

          <Card className="mb-6" data-testid="card-category-table">
            <CardHeader className="flex flex-row items-center justify-between gap-4 pb-3">
              <CardTitle className="text-lg">Accountant-Friendly Breakdown</CardTitle>
              <Badge variant="outline" className="no-default-active-elevate text-xs gap-1">
                <Shield className="h-3 w-3" />
                IRS Schedule C Categories
              </Badge>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Total Spent</TableHead>
                      <TableHead className="text-right">Deductible Amount</TableHead>
                      <TableHead>Audit Risk</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summary.categoryBreakdown.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                          No expenses recorded for {taxYear}
                        </TableCell>
                      </TableRow>
                    ) : (
                      <>
                        {summary.categoryBreakdown.map((cat) => (
                          <TableRow key={cat.category} data-testid={`row-category-${cat.category.replace(/\s+/g, "-").toLowerCase()}`}>
                            <TableCell className="font-medium">{cat.category}</TableCell>
                            <TableCell className="text-right font-mono">
                              ${cat.totalSpent.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              ${cat.deductibleAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                              {cat.deductibleAmount < cat.totalSpent && (
                                <span className="text-xs text-muted-foreground ml-1">
                                  ({Math.round((cat.deductibleAmount / cat.totalSpent) * 100)}% Biz)
                                </span>
                              )}
                            </TableCell>
                            <TableCell>
                              <AuditRiskBadge risk={cat.auditRisk} />
                            </TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="border-t-2 font-bold">
                          <TableCell>TOTAL</TableCell>
                          <TableCell className="text-right font-mono">
                            ${summary.totalExpenses.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            ${summary.totalDeductions.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell></TableCell>
                        </TableRow>
                      </>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {summary.saltTotal > 0 && (
            <Card className="mb-6 border-yellow-500/20">
              <CardContent className="py-3 px-4 flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-yellow-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-sm">SALT Deduction Cap Notice</p>
                  <p className="text-sm text-muted-foreground">
                    Your Property Tax (SALT) total is ${summary.saltTotal.toLocaleString()}. The 2026 SALT cap is $40,000.
                    {summary.saltTotal > 40000
                      ? ` Only $40,000 is deductible — you lose $${(summary.saltTotal - 40000).toLocaleString()} in deductions.`
                      : " You are within the cap."}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          <Card data-testid="card-export-actions">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Export Your Tax Pack</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <Button
                  variant="outline"
                  className="justify-start gap-3"
                  disabled={downloading !== null}
                  onClick={() => downloadFile("/api/export/expenses-csv", `MCTUSA_Expenses_${taxYear}.csv`)}
                  data-testid="button-download-expenses-csv"
                >
                  <FileSpreadsheet className="h-4 w-4 text-green-600" />
                  <div className="text-left">
                    <p className="text-sm font-medium">Expenses CSV</p>
                    <p className="text-[11px] text-muted-foreground">Spreadsheet format</p>
                  </div>
                </Button>
                <Button
                  variant="outline"
                  className="justify-start gap-3"
                  disabled={downloading !== null}
                  onClick={() => downloadFile("/api/export/mileage-csv", `MCTUSA_Mileage_${taxYear}.csv`)}
                  data-testid="button-download-mileage-csv"
                >
                  <FileSpreadsheet className="h-4 w-4 text-blue-600" />
                  <div className="text-left">
                    <p className="text-sm font-medium">Mileage CSV</p>
                    <p className="text-[11px] text-muted-foreground">IRS Pub 463 compliant</p>
                  </div>
                </Button>
                <Button
                  variant="outline"
                  className="justify-start gap-3"
                  disabled={downloading !== null}
                  onClick={() => downloadFile("/api/export/income-csv", `MCTUSA_Income_${taxYear}.csv`)}
                  data-testid="button-download-income-csv"
                >
                  <FileSpreadsheet className="h-4 w-4 text-purple-600" />
                  <div className="text-left">
                    <p className="text-sm font-medium">Income CSV</p>
                    <p className="text-[11px] text-muted-foreground">1099-K/NEC sources</p>
                  </div>
                </Button>
                <Button
                  variant="outline"
                  className="justify-start gap-3"
                  disabled={downloading !== null || !isPro}
                  onClick={() => downloadFile("/api/export/receipt-vault-zip", `MCTUSA_Receipt_Vault_${taxYear}.zip`)}
                  data-testid="button-download-receipt-vault"
                >
                  <Archive className="h-4 w-4 text-amber-600" />
                  <div className="text-left">
                    <p className="text-sm font-medium">Receipt Vault ZIP</p>
                    <p className="text-[11px] text-muted-foreground">
                      {isPro ? `${summary.receiptCount} receipts by month` : "Pro subscribers only"}
                    </p>
                  </div>
                </Button>
              </div>

              <div className="border-t border-border pt-4">
                <Button
                  size="lg"
                  className="w-full sm:w-auto gap-2"
                  disabled={downloading !== null}
                  onClick={handleBulkExport}
                  data-testid="button-bulk-export"
                >
                  <Download className="h-5 w-5" />
                  {downloading === "bulk" ? "Exporting..." : "Export All Reports"}
                </Button>
                <p className="text-xs text-muted-foreground mt-2">
                  Downloads Expenses, Mileage, and Income CSVs in one click. Hand these to your accountant or upload to TurboTax / FreeTaxUSA.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="mt-6">
            <CardContent className="py-4 px-4">
              <div className="flex items-start gap-3">
                <FileText className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-sm">IRS Circular 230 Disclosure</p>
                  <p className="text-xs text-muted-foreground leading-relaxed mt-1">
                    To ensure compliance with requirements imposed by the IRS, we inform you that any tax advice contained in this communication (including any attachments) is not intended or written to be used, and cannot be used, for the purpose of (i) avoiding penalties under the Internal Revenue Code or (ii) promoting, marketing or recommending to another party any transaction or matter addressed herein. This export is prepared by My Cab Tax USA as a self-preparation tool. Consult a qualified tax professional for personalized advice.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}

      <SuccessModal open={showSuccess} onClose={() => setShowSuccess(false)} taxYear={parseInt(taxYear)} />
    </Layout>
  );
}
