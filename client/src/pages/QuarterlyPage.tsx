import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarClock, CheckCircle, Clock, AlertTriangle, Send, RefreshCw, Shield, FileText, Inbox, Copy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface QuarterlySub {
  id: number;
  taxYear: number;
  quarter: number;
  jurisdiction: string;
  status: string;
  totalIncome: string;
  totalExpenses: string;
  netProfit: string;
  submittedAt: string | null;
  referenceId: string | null;
  createdAt: string;
}

interface VaultEmailInfo {
  vaultEmail: string;
  userId: string;
}

interface EInvoice {
  id: number;
  vaultEmail: string;
  senderEmail: string | null;
  senderName: string | null;
  invoiceNumber: string | null;
  amount: string | null;
  currency: string;
  description: string | null;
  status: string;
  linkedExpenseId: number | null;
  createdAt: string;
}

export default function QuarterlyPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [selectedYear, setSelectedYear] = useState("2026");
  const [selectedQuarter, setSelectedQuarter] = useState("1");
  const [selectedJurisdiction, setSelectedJurisdiction] = useState("US");

  const { data: submissions, isLoading: subsLoading } = useQuery<QuarterlySub[]>({
    queryKey: ["/api/quarterly-submissions"],
  });

  const { data: vaultEmail } = useQuery<VaultEmailInfo>({
    queryKey: ["/api/vault-email"],
  });

  const { data: eInvoices } = useQuery<EInvoice[]>({
    queryKey: ["/api/e-invoices"],
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/quarterly-submissions/generate", {
        taxYear: parseInt(selectedYear),
        quarter: parseInt(selectedQuarter),
        jurisdiction: selectedJurisdiction,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quarterly-submissions"] });
      toast({ title: t("quarterly.generated", "Quarterly summary generated"), description: t("quarterly.reviewAndSubmit", "Review the numbers and submit when ready.") });
    },
    onError: (err: any) => {
      toast({ title: t("common.error", "Error"), description: err.message, variant: "destructive" });
    },
  });

  const submitMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/quarterly-submissions/${id}/submit`);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/quarterly-submissions"] });
      toast({
        title: t("quarterly.submitted", "Quarterly filing submitted"),
        description: `${t("quarterly.reference", "Reference")}: ${data.referenceId}`,
      });
    },
    onError: (err: any) => {
      toast({ title: t("common.error", "Error"), description: err.message, variant: "destructive" });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/e-invoices/${id}/approve`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/e-invoices"] });
      toast({ title: t("einvoice.approved", "Invoice approved"), description: t("einvoice.expenseCreated", "Expense created from invoice.") });
    },
  });

  const statusBadge = (status: string) => {
    if (status === "submitted") return <Badge data-testid="badge-submitted"><CheckCircle className="h-3 w-3 mr-1" />{t("quarterly.filed", "Filed")}</Badge>;
    if (status === "ready") return <Badge variant="secondary" data-testid="badge-ready"><Clock className="h-3 w-3 mr-1" />{t("quarterly.ready", "Ready")}</Badge>;
    return <Badge variant="outline" data-testid="badge-pending">{t("quarterly.pending", "Pending")}</Badge>;
  };

  return (
    <Layout>
      <div className="space-y-6" data-testid="quarterly-page">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-quarterly-title">
            {t("quarterly.title", "Quarterly Filing & E-Invoicing")}
          </h1>
          <p className="text-muted-foreground text-sm">
            {t("quarterly.subtitle", "Generate quarterly tax summaries and manage digital invoices")}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2" data-testid="card-generate-quarterly">
            <CardHeader>
              <div className="flex items-center gap-2">
                <CalendarClock className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">{t("quarterly.generate", "Generate Quarterly Summary")}</CardTitle>
              </div>
              <CardDescription>
                {t("quarterly.generateDesc", "Scan your vault data and prepare a quarterly filing summary for IRS (1040-ES) or HMRC (MTD).")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-3 items-end">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">{t("quarterly.year", "Tax Year")}</label>
                  <Select value={selectedYear} onValueChange={setSelectedYear}>
                    <SelectTrigger className="w-28" data-testid="select-year">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="2025">2025</SelectItem>
                      <SelectItem value="2026">2026</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">{t("quarterly.quarter", "Quarter")}</label>
                  <Select value={selectedQuarter} onValueChange={setSelectedQuarter}>
                    <SelectTrigger className="w-24" data-testid="select-quarter">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Q1</SelectItem>
                      <SelectItem value="2">Q2</SelectItem>
                      <SelectItem value="3">Q3</SelectItem>
                      <SelectItem value="4">Q4</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">{t("quarterly.jurisdiction", "Jurisdiction")}</label>
                  <Select value={selectedJurisdiction} onValueChange={setSelectedJurisdiction}>
                    <SelectTrigger className="w-32" data-testid="select-jurisdiction">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="US">US (IRS)</SelectItem>
                      <SelectItem value="UK">UK (HMRC MTD)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  onClick={() => generateMutation.mutate()}
                  disabled={generateMutation.isPending}
                  data-testid="button-generate-quarterly"
                >
                  {generateMutation.isPending ? (
                    <><RefreshCw className="h-4 w-4 mr-1 animate-spin" />{t("common.generating", "Generating...")}</>
                  ) : (
                    <><FileText className="h-4 w-4 mr-1" />{t("quarterly.scanAndGenerate", "Scan & Generate")}</>
                  )}
                </Button>
              </div>

              {selectedJurisdiction === "UK" && (
                <div className="mt-3 p-2 rounded bg-blue-50 dark:bg-blue-950/30 text-xs text-blue-700 dark:text-blue-300 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>{t("quarterly.mtdNote", "UK Making Tax Digital: Mandatory quarterly updates for income over £50k from April 6, 2026. Avoid late-filing penalty points.")}</span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card data-testid="card-vault-email">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Inbox className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">{t("einvoice.vaultEmail", "Your Vault Email")}</CardTitle>
              </div>
              <CardDescription>
                {t("einvoice.vaultDesc", "Vendors can send digital invoices directly to this address — no OCR needed.")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {vaultEmail ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-muted">
                    <code className="text-sm font-mono flex-1" data-testid="text-vault-email">{vaultEmail.vaultEmail}</code>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        navigator.clipboard.writeText(vaultEmail.vaultEmail);
                        toast({ title: t("common.copied", "Copied!") });
                      }}
                      data-testid="button-copy-vault-email"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t("einvoice.howItWorks", "Share this email with fuel stations, repair shops, and vendors. Digital invoices sent here are auto-parsed and logged.")}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t("common.loading", "Loading...")}</p>
              )}
            </CardContent>
          </Card>
        </div>

        <Card data-testid="card-quarterly-history">
          <CardHeader>
            <CardTitle className="text-base">{t("quarterly.history", "Filing History")}</CardTitle>
          </CardHeader>
          <CardContent>
            {subsLoading ? (
              <p className="text-sm text-muted-foreground">{t("common.loading", "Loading...")}</p>
            ) : submissions && submissions.length > 0 ? (
              <div className="space-y-2">
                <div className="grid grid-cols-7 text-xs font-medium text-muted-foreground border-b pb-2">
                  <span>{t("quarterly.period", "Period")}</span>
                  <span>{t("quarterly.region", "Region")}</span>
                  <span className="text-right">{t("quarterly.income", "Income")}</span>
                  <span className="text-right">{t("quarterly.expenses", "Expenses")}</span>
                  <span className="text-right">{t("quarterly.netProfit", "Net Profit")}</span>
                  <span className="text-center">{t("quarterly.status", "Status")}</span>
                  <span className="text-center">{t("quarterly.action", "Action")}</span>
                </div>
                {submissions.map((sub) => (
                  <div key={sub.id} className="grid grid-cols-7 text-sm items-center py-2 border-b border-muted/30" data-testid={`row-filing-${sub.id}`}>
                    <span className="font-medium">Q{sub.quarter} {sub.taxYear}</span>
                    <Badge variant="outline" className="w-fit text-xs">{sub.jurisdiction}</Badge>
                    <span className="text-right">${Number(sub.totalIncome).toLocaleString()}</span>
                    <span className="text-right text-destructive">${Number(sub.totalExpenses).toLocaleString()}</span>
                    <span className="text-right font-medium">${Number(sub.netProfit).toLocaleString()}</span>
                    <div className="text-center">{statusBadge(sub.status)}</div>
                    <div className="text-center">
                      {sub.status === "ready" && (
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => submitMutation.mutate(sub.id)}
                          disabled={submitMutation.isPending}
                          data-testid={`button-submit-${sub.id}`}
                        >
                          <Send className="h-3 w-3 mr-1" />
                          {t("quarterly.file", "File")}
                        </Button>
                      )}
                      {sub.status === "submitted" && sub.referenceId && (
                        <span className="text-xs font-mono text-muted-foreground" data-testid={`text-ref-${sub.id}`}>{sub.referenceId}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-muted-foreground">
                <CalendarClock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">{t("quarterly.noFilings", "No quarterly filings yet")}</p>
                <p className="text-xs mt-1">{t("quarterly.generateFirst", "Generate your first quarterly summary above")}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {eInvoices && eInvoices.length > 0 && (
          <Card data-testid="card-einvoice-list">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Inbox className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">{t("einvoice.received", "Received E-Invoices")}</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {eInvoices.map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between p-3 rounded-lg border" data-testid={`row-einvoice-${inv.id}`}>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{inv.description || t("einvoice.noDescription", "No description")}</span>
                        {inv.invoiceNumber && <Badge variant="outline" className="text-xs">#{inv.invoiceNumber}</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {inv.senderName || inv.senderEmail || t("einvoice.unknownSender", "Unknown sender")} — {inv.currency} {Number(inv.amount || 0).toLocaleString()}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={inv.status === "approved" ? "default" : "secondary"}>{inv.status}</Badge>
                      {inv.status === "received" && (
                        <Button
                          size="sm"
                          onClick={() => approveMutation.mutate(inv.id)}
                          disabled={approveMutation.isPending}
                          data-testid={`button-approve-${inv.id}`}
                        >
                          <CheckCircle className="h-3 w-3 mr-1" />
                          {t("einvoice.approve", "Approve")}
                        </Button>
                      )}
                      {inv.linkedExpenseId && (
                        <Badge variant="outline" className="text-xs">
                          <CheckCircle className="h-3 w-3 mr-1 text-green-500" />
                          {t("einvoice.linked", "Linked")}
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
