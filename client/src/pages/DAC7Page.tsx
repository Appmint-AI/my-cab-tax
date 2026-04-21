import { useState, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Plus, Loader2, ArrowRight } from "lucide-react";
import Papa from "papaparse";

interface CsvRow {
  date: string;
  amount: number;
  description: string;
  category?: string;
  rawRow: Record<string, string>;
}

interface ComparisonResult {
  matched: { csv: CsvRow; expense: any }[];
  missing: CsvRow[];
  extra: any[];
}

function normalizeDate(dateStr: string): string {
  if (!dateStr) return "";
  const cleaned = dateStr.trim();
  const formats = [
    /^(\d{4})-(\d{2})-(\d{2})/, // YYYY-MM-DD
    /^(\d{2})\/(\d{2})\/(\d{4})/, // MM/DD/YYYY
    /^(\d{2})-(\d{2})-(\d{4})/, // MM-DD-YYYY
  ];

  const isoMatch = cleaned.match(formats[0]);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  const usMatch = cleaned.match(formats[1]);
  if (usMatch) return `${usMatch[3]}-${usMatch[1]}-${usMatch[2]}`;

  const usDashMatch = cleaned.match(formats[2]);
  if (usDashMatch) return `${usDashMatch[3]}-${usDashMatch[1]}-${usDashMatch[2]}`;

  return cleaned.substring(0, 10);
}

function findDateColumn(headers: string[]): string | null {
  const datePatterns = ["date", "trip_date", "transaction_date", "payment_date", "completed_at", "created_at", "timestamp"];
  const lower = headers.map(h => h.toLowerCase().trim());
  for (const p of datePatterns) {
    const idx = lower.findIndex(h => h.includes(p));
    if (idx >= 0) return headers[idx];
  }
  return null;
}

function findAmountColumn(headers: string[]): string | null {
  const amountPatterns = ["amount", "total", "fare", "earnings", "payout", "net_amount", "gross", "price", "payment"];
  const lower = headers.map(h => h.toLowerCase().trim());
  for (const p of amountPatterns) {
    const idx = lower.findIndex(h => h.includes(p));
    if (idx >= 0) return headers[idx];
  }
  return null;
}

function findDescriptionColumn(headers: string[]): string | null {
  const descPatterns = ["description", "trip_type", "type", "category", "service", "product", "memo", "note"];
  const lower = headers.map(h => h.toLowerCase().trim());
  for (const p of descPatterns) {
    const idx = lower.findIndex(h => h.includes(p));
    if (idx >= 0) return headers[idx];
  }
  return null;
}

function compareRecords(csvRows: CsvRow[], expenses: any[]): ComparisonResult {
  const matched: ComparisonResult["matched"] = [];
  const missing: CsvRow[] = [];
  const usedExpenseIds = new Set<number>();

  for (const csv of csvRows) {
    const csvDate = normalizeDate(csv.date);
    const csvAmount = Math.abs(csv.amount);
    let found = false;

    for (const exp of expenses) {
      if (usedExpenseIds.has(exp.id)) continue;
      const expDate = normalizeDate(exp.date);
      const expAmount = Math.abs(parseFloat(exp.amount));
      if (
        csvDate === expDate &&
        Math.abs(csvAmount - expAmount) < 0.02
      ) {
        matched.push({ csv, expense: exp });
        usedExpenseIds.add(exp.id);
        found = true;
        break;
      }
    }

    if (!found) {
      missing.push(csv);
    }
  }

  const extra = expenses.filter(e => !usedExpenseIds.has(e.id));

  return { matched, missing, extra };
}

export default function DAC7Page() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [csvRows, setCsvRows] = useState<CsvRow[]>([]);
  const [result, setResult] = useState<ComparisonResult | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [comparing, setComparing] = useState(false);
  const [addingIds, setAddingIds] = useState<Set<number>>(new Set());

  const expensesQuery = useQuery<any[]>({
    queryKey: ["/api/expenses"],
  });

  const addExpenseMutation = useMutation({
    mutationFn: async (row: CsvRow) => {
      return apiRequest("POST", "/api/expenses", {
        amount: row.amount.toString(),
        date: normalizeDate(row.date),
        category: row.category || "Other Expenses",
        description: row.description || "Imported from platform CSV",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tax/summary"] });
    },
  });

  const handleFileUpload = useCallback((file: File) => {
    setFileName(file.name);
    setResult(null);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (!results.data || results.data.length === 0) {
          toast({ title: "Empty CSV", description: "No data rows found in the file.", variant: "destructive" });
          return;
        }

        const headers = Object.keys(results.data[0] as Record<string, string>);
        const dateCol = findDateColumn(headers);
        const amountCol = findAmountColumn(headers);
        const descCol = findDescriptionColumn(headers);

        if (!dateCol || !amountCol) {
          toast({
            title: "Column Detection Failed",
            description: `Could not find date or amount columns. Found headers: ${headers.join(", ")}`,
            variant: "destructive",
          });
          return;
        }

        const rows: CsvRow[] = (results.data as Record<string, string>[])
          .filter(row => row[dateCol] && row[amountCol])
          .map(row => ({
            date: row[dateCol],
            amount: parseFloat(row[amountCol].replace(/[^0-9.-]/g, "")) || 0,
            description: descCol ? row[descCol] || "" : "",
            rawRow: row,
          }))
          .filter(row => row.amount !== 0);

        setCsvRows(rows);

        toast({
          title: "CSV Loaded",
          description: `Found ${rows.length} transactions from ${file.name}`,
        });
      },
      error: () => {
        toast({ title: "Parse Error", description: "Failed to parse CSV file.", variant: "destructive" });
      },
    });
  }, [toast]);

  const handleCompare = useCallback(() => {
    if (!csvRows.length || !expensesQuery.data) return;
    setComparing(true);
    setTimeout(() => {
      const res = compareRecords(csvRows, expensesQuery.data);
      setResult(res);
      setComparing(false);
    }, 500);
  }, [csvRows, expensesQuery.data]);

  const handleAddMissing = async (row: CsvRow, index: number) => {
    setAddingIds(prev => new Set(prev).add(index));
    try {
      await addExpenseMutation.mutateAsync(row);
      if (result) {
        const newMissing = result.missing.filter((_, i) => i !== index);
        setResult({ ...result, missing: newMissing });
      }
      toast({ title: "Expense Added", description: `$${row.amount.toFixed(2)} on ${row.date}` });
    } catch {
      toast({ title: "Failed to add", variant: "destructive" });
    } finally {
      setAddingIds(prev => {
        const next = new Set(prev);
        next.delete(index);
        return next;
      });
    }
  };

  const handleAddAllMissing = async () => {
    if (!result?.missing.length) return;
    for (let i = 0; i < result.missing.length; i++) {
      await handleAddMissing(result.missing[i], i);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith(".csv")) {
      handleFileUpload(file);
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-dac7-title">{t("dac7.title")}</h1>
          <p className="text-muted-foreground mt-1" data-testid="text-dac7-subtitle">{t("dac7.subtitle")}</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              {t("dac7.uploadCsv")}
            </CardTitle>
            <CardDescription>{t("dac7.supportedPlatforms")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div
              className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onDragOver={(e) => e.preventDefault()}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              data-testid="dropzone-csv"
            >
              <Upload className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
              <p className="text-sm text-muted-foreground">{t("dac7.dragDrop")}</p>
              {fileName && (
                <Badge variant="secondary" className="mt-3" data-testid="badge-filename">
                  {fileName} — {csvRows.length} rows
                </Badge>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileUpload(file);
                }}
                data-testid="input-csv-file"
              />
            </div>

            {csvRows.length > 0 && !result && (
              <div className="mt-4 flex justify-center">
                <Button
                  onClick={handleCompare}
                  disabled={comparing || expensesQuery.isLoading}
                  data-testid="button-compare"
                >
                  {comparing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      {t("dac7.comparing")}
                    </>
                  ) : (
                    <>
                      <ArrowRight className="h-4 w-4 mr-2" />
                      {t("dac7.compareRows", { count: csvRows.length })}
                    </>
                  )}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {result && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4 text-center">
                <CheckCircle2 className="h-8 w-8 mx-auto text-green-500 mb-2" />
                <p className="text-2xl font-bold" data-testid="text-matched-count">{result.matched.length}</p>
                <p className="text-sm text-muted-foreground">{t("dac7.matched")}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <AlertTriangle className="h-8 w-8 mx-auto text-amber-500 mb-2" />
                <p className="text-2xl font-bold" data-testid="text-missing-count">{result.missing.length}</p>
                <p className="text-sm text-muted-foreground">{t("dac7.missingDeductions")}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <Plus className="h-8 w-8 mx-auto text-blue-500 mb-2" />
                <p className="text-2xl font-bold" data-testid="text-extra-count">{result.extra.length}</p>
                <p className="text-sm text-muted-foreground">{t("dac7.extraInApp")}</p>
              </CardContent>
            </Card>
          </div>
        )}

        {result && result.missing.length > 0 && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-amber-600 dark:text-amber-400 flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5" />
                  {t("dac7.missingDeductions")} ({result.missing.length})
                </CardTitle>
                <CardDescription>
                  {t("dac7.missingDescription")}
                </CardDescription>
              </div>
              <Button
                variant="default"
                size="sm"
                onClick={handleAddAllMissing}
                data-testid="button-add-all-missing"
              >
                <Plus className="h-4 w-4 mr-1" />
                {t("dac7.addAllMissing")}
              </Button>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="p-2 font-medium">{t("common.date")}</th>
                      <th className="p-2 font-medium">{t("common.amount")}</th>
                      <th className="p-2 font-medium">{t("common.description")}</th>
                      <th className="p-2 font-medium text-right">{t("common.actions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.missing.map((row, i) => (
                      <tr key={i} className="border-b last:border-0 hover:bg-muted/50" data-testid={`row-missing-${i}`}>
                        <td className="p-2">{row.date}</td>
                        <td className="p-2 font-mono">${row.amount.toFixed(2)}</td>
                        <td className="p-2 text-muted-foreground truncate max-w-[200px]">{row.description || "—"}</td>
                        <td className="p-2 text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleAddMissing(row, i)}
                            disabled={addingIds.has(i)}
                            data-testid={`button-add-missing-${i}`}
                          >
                            {addingIds.has(i) ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <>
                                <Plus className="h-3 w-3 mr-1" />
                                {t("dac7.addMissing")}
                              </>
                            )}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {result && result.missing.length === 0 && (
          <Card>
            <CardContent className="p-8 text-center">
              <CheckCircle2 className="h-12 w-12 mx-auto text-green-500 mb-3" />
              <p className="text-lg font-medium" data-testid="text-no-missing">{t("dac7.noMissing")}</p>
            </CardContent>
          </Card>
        )}

        {result && result.matched.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-green-600 dark:text-green-400 flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5" />
                {t("dac7.matched")} ({result.matched.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="p-2 font-medium">{t("common.date")}</th>
                      <th className="p-2 font-medium">{t("dac7.platformAmount")}</th>
                      <th className="p-2 font-medium">{t("dac7.appAmount")}</th>
                      <th className="p-2 font-medium">{t("dac7.matchStatus")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.matched.slice(0, 20).map((m, i) => (
                      <tr key={i} className="border-b last:border-0" data-testid={`row-matched-${i}`}>
                        <td className="p-2">{m.csv.date}</td>
                        <td className="p-2 font-mono">${m.csv.amount.toFixed(2)}</td>
                        <td className="p-2 font-mono">${parseFloat(m.expense.amount).toFixed(2)}</td>
                        <td className="p-2">
                          <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                            ✓ {t("dac7.matched")}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                    {result.matched.length > 20 && (
                      <tr>
                        <td colSpan={4} className="p-2 text-center text-muted-foreground">
                          {t("dac7.moreMatched", { count: result.matched.length - 20 })}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
