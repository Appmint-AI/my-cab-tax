import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileSpreadsheet, ArrowDownToLine, Trash2, CheckCircle, Clock, Loader2, Car, Package, Bike, DollarSign, TrendingUp, Calendar } from "lucide-react";
import { format, parseISO } from "date-fns";
import Papa from "papaparse";
import type { GigSyncEntry } from "@shared/schema";

const PLATFORM_CONFIGS: Record<string, { label: string; icon: typeof Car; color: string; dateColumns: string[]; amountColumns: string[]; descColumns: string[]; tipColumns: string[]; feeColumns: string[]; mileColumns: string[] }> = {
  uber: {
    label: "Uber",
    icon: Car,
    color: "bg-black text-white",
    dateColumns: ["date", "trip date", "request time", "dropoff time", "trip_date"],
    amountColumns: ["amount", "total", "fare", "earnings", "driver_total", "your earnings", "trip earnings"],
    descColumns: ["description", "trip type", "city", "route", "pickup", "trip_type"],
    tipColumns: ["tip", "tips", "tip amount", "rider tip"],
    feeColumns: ["service fee", "booking fee", "commission", "uber fee", "platform fee"],
    mileColumns: ["miles", "distance", "trip miles", "distance (miles)"],
  },
  bolt: {
    label: "Bolt",
    icon: Bike,
    color: "bg-green-600 text-white",
    dateColumns: ["date", "ride date", "pickup time", "order date"],
    amountColumns: ["amount", "total", "earnings", "payout", "net earnings"],
    descColumns: ["description", "ride type", "city", "category"],
    tipColumns: ["tip", "tips"],
    feeColumns: ["commission", "bolt fee", "service fee"],
    mileColumns: ["distance", "km", "miles"],
  },
  lyft: {
    label: "Lyft",
    icon: Car,
    color: "bg-pink-600 text-white",
    dateColumns: ["date", "ride date", "pickup date", "trip date"],
    amountColumns: ["amount", "total", "earnings", "payout", "ride earnings"],
    descColumns: ["description", "ride type", "route"],
    tipColumns: ["tip", "tips", "rider tip"],
    feeColumns: ["lyft fee", "service fee", "platform fee"],
    mileColumns: ["miles", "distance"],
  },
  doordash: {
    label: "DoorDash",
    icon: Package,
    color: "bg-red-600 text-white",
    dateColumns: ["date", "delivery date", "completed date", "dasher_pay_date"],
    amountColumns: ["amount", "total", "earnings", "dasher pay", "total pay"],
    descColumns: ["description", "delivery type", "restaurant"],
    tipColumns: ["tip", "tips", "customer tip"],
    feeColumns: ["service fee", "deductions"],
    mileColumns: ["miles", "distance", "total miles"],
  },
  other: {
    label: "Other Platform",
    icon: FileSpreadsheet,
    color: "bg-gray-600 text-white",
    dateColumns: ["date", "transaction date", "pay date"],
    amountColumns: ["amount", "total", "earnings", "payout", "net"],
    descColumns: ["description", "type", "category", "notes"],
    tipColumns: ["tip", "tips"],
    feeColumns: ["fee", "commission", "service fee"],
    mileColumns: ["miles", "distance"],
  },
};

function findColumn(headers: string[], candidates: string[]): string | null {
  const lowerHeaders = headers.map(h => h.toLowerCase().trim());
  for (const candidate of candidates) {
    const idx = lowerHeaders.indexOf(candidate.toLowerCase());
    if (idx >= 0) return headers[idx];
  }
  for (const candidate of candidates) {
    const idx = lowerHeaders.findIndex(h => h.includes(candidate.toLowerCase()));
    if (idx >= 0) return headers[idx];
  }
  return null;
}

export default function SyncPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [platform, setPlatform] = useState<string>("uber");
  const [parsedEntries, setParsedEntries] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const { data: entries = [], isLoading } = useQuery<GigSyncEntry[]>({
    queryKey: ["/api/gig-sync/entries"],
  });

  const uploadMutation = useMutation({
    mutationFn: (data: { platform: string; entries: any[] }) =>
      apiRequest("POST", "/api/gig-sync/upload", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/gig-sync/entries"] });
      setParsedEntries([]);
      toast({ title: "Earnings Imported", description: `Successfully synced earnings from ${PLATFORM_CONFIGS[platform]?.label}` });
    },
    onError: (err: any) => {
      toast({ title: "Import Failed", description: err.message, variant: "destructive" });
    },
  });

  const importMutation = useMutation({
    mutationFn: (entryIds: number[]) =>
      apiRequest("POST", "/api/gig-sync/import-to-income", { entryIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/gig-sync/entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/incomes"] });
      setSelectedIds(new Set());
      toast({ title: "Income Created", description: "Selected entries imported to your income log" });
    },
  });

  const clearMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/gig-sync/entries"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/gig-sync/entries"] });
      toast({ title: "Cleared", description: "All sync entries removed" });
    },
  });

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (!results.data?.length || !results.meta?.fields?.length) {
          toast({ title: "Parse Error", description: "Could not parse CSV file", variant: "destructive" });
          return;
        }

        const headers = results.meta.fields;
        const config = PLATFORM_CONFIGS[platform] || PLATFORM_CONFIGS.other;

        const dateCol = findColumn(headers, config.dateColumns);
        const amountCol = findColumn(headers, config.amountColumns);
        const descCol = findColumn(headers, config.descColumns);
        const tipCol = findColumn(headers, config.tipColumns);
        const feeCol = findColumn(headers, config.feeColumns);
        const mileCol = findColumn(headers, config.mileColumns);

        if (!dateCol || !amountCol) {
          toast({
            title: "Column Detection Failed",
            description: `Could not find date/amount columns. Headers: ${headers.join(", ")}`,
            variant: "destructive",
          });
          return;
        }

        const parsed = results.data.map((row: any) => {
          let dateStr = row[dateCol] || "";
          const dateMatch = dateStr.match(/\d{4}-\d{2}-\d{2}/);
          if (dateMatch) {
            dateStr = dateMatch[0];
          } else {
            const parts = dateStr.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
            if (parts) {
              const year = parts[3].length === 2 ? `20${parts[3]}` : parts[3];
              dateStr = `${year}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}`;
            }
          }

          const amount = parseFloat(String(row[amountCol] || "0").replace(/[^0-9.\-]/g, "")) || 0;
          const tips = tipCol ? parseFloat(String(row[tipCol] || "0").replace(/[^0-9.\-]/g, "")) || 0 : 0;
          const fees = feeCol ? parseFloat(String(row[feeCol] || "0").replace(/[^0-9.\-]/g, "")) || 0 : 0;
          const miles = mileCol ? parseFloat(String(row[mileCol] || "0").replace(/[^0-9.\-]/g, "")) || 0 : 0;

          return {
            date: dateStr,
            amount: amount.toFixed(2),
            description: descCol ? String(row[descCol] || "") : "",
            tips: tips.toFixed(2),
            platformFees: fees.toFixed(2),
            miles: miles.toFixed(1),
            tripType: descCol ? String(row[descCol] || "") : "",
            rawCsvRow: row,
          };
        }).filter((e: any) => e.date && parseFloat(e.amount) > 0);

        setParsedEntries(parsed);
        toast({ title: "CSV Parsed", description: `Found ${parsed.length} entries from ${config.label}` });
      },
      error: () => {
        toast({ title: "File Error", description: "Could not read the CSV file", variant: "destructive" });
      },
    });
    e.target.value = "";
  }, [platform, toast]);

  const handleConfirmUpload = () => {
    uploadMutation.mutate({ platform, entries: parsedEntries });
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    const notImported = entries.filter(e => !e.importedToIncome);
    setSelectedIds(new Set(notImported.map(e => e.id)));
  };

  const totalsByPlatform: Record<string, { count: number; total: number }> = {};
  for (const e of entries) {
    if (!totalsByPlatform[e.platform]) totalsByPlatform[e.platform] = { count: 0, total: 0 };
    totalsByPlatform[e.platform].count++;
    totalsByPlatform[e.platform].total += parseFloat(e.amount);
  }

  const grandTotal = entries.reduce((sum, e) => sum + parseFloat(e.amount), 0);
  const sortedEntries = [...entries].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-sync-title">Multi-Gig Bridge</h1>
          <p className="text-muted-foreground mt-1" data-testid="text-sync-subtitle">
            Upload earnings from multiple platforms and merge them into one unified timeline
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
                <DollarSign className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Earnings</p>
                <p className="text-xl font-bold" data-testid="text-sync-total">${grandTotal.toFixed(2)}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                <TrendingUp className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Platforms Synced</p>
                <p className="text-xl font-bold" data-testid="text-sync-platforms">{Object.keys(totalsByPlatform).length}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 bg-purple-100 dark:bg-purple-900 rounded-lg">
                <Calendar className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Entries</p>
                <p className="text-xl font-bold" data-testid="text-sync-entries">{entries.length}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {Object.keys(totalsByPlatform).length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base">Platform Breakdown</CardTitle></CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-3">
                {Object.entries(totalsByPlatform).map(([p, data]) => {
                  const config = PLATFORM_CONFIGS[p] || PLATFORM_CONFIGS.other;
                  return (
                    <Badge key={p} variant="outline" className="px-3 py-2 gap-2 text-sm" data-testid={`badge-platform-${p}`}>
                      <span className={`inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold ${config.color}`}>
                        {config.label[0]}
                      </span>
                      {config.label}: {data.count} trips — ${data.total.toFixed(2)}
                    </Badge>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Upload className="h-5 w-5" />
              Upload Earnings Statement
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Platform</label>
                <Select value={platform} onValueChange={setPlatform}>
                  <SelectTrigger data-testid="select-platform">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PLATFORM_CONFIGS).map(([key, config]) => (
                      <SelectItem key={key} value={key} data-testid={`option-platform-${key}`}>
                        {config.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">CSV File</label>
                <label className="flex items-center gap-2 border border-dashed rounded-md p-3 cursor-pointer hover:bg-muted/50 transition-colors">
                  <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Choose CSV file...</span>
                  <input
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={handleFileUpload}
                    data-testid="input-csv-upload"
                  />
                </label>
              </div>
            </div>

            {parsedEntries.length > 0 && (
              <div className="border rounded-md p-4 bg-muted/30 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">
                    Preview: {parsedEntries.length} entries from {PLATFORM_CONFIGS[platform]?.label || platform}
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setParsedEntries([])} data-testid="button-cancel-upload">
                      Cancel
                    </Button>
                    <Button size="sm" onClick={handleConfirmUpload} disabled={uploadMutation.isPending} data-testid="button-confirm-upload">
                      {uploadMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <ArrowDownToLine className="h-3 w-3 mr-1" />}
                      Import {parsedEntries.length} Entries
                    </Button>
                  </div>
                </div>
                <div className="max-h-48 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-1">Date</th>
                        <th className="text-right p-1">Amount</th>
                        <th className="text-right p-1">Tips</th>
                        <th className="text-left p-1">Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsedEntries.slice(0, 10).map((e, i) => (
                        <tr key={i} className="border-b border-muted">
                          <td className="p-1">{e.date}</td>
                          <td className="p-1 text-right">${e.amount}</td>
                          <td className="p-1 text-right">${e.tips}</td>
                          <td className="p-1 truncate max-w-[120px]">{e.description}</td>
                        </tr>
                      ))}
                      {parsedEntries.length > 10 && (
                        <tr><td colSpan={4} className="p-1 text-center text-muted-foreground">...and {parsedEntries.length - 10} more</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {entries.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Merged Timeline</CardTitle>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={selectAll} data-testid="button-select-all">
                    Select All
                  </Button>
                  {selectedIds.size > 0 && (
                    <Button size="sm" onClick={() => importMutation.mutate([...selectedIds])} disabled={importMutation.isPending} data-testid="button-import-selected">
                      {importMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <ArrowDownToLine className="h-3 w-3 mr-1" />}
                      Import {selectedIds.size} to Income
                    </Button>
                  )}
                  <Button variant="destructive" size="sm" onClick={() => clearMutation.mutate()} disabled={clearMutation.isPending} data-testid="button-clear-sync">
                    <Trash2 className="h-3 w-3 mr-1" />
                    Clear All
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-2 w-8"></th>
                        <th className="text-left p-2">Platform</th>
                        <th className="text-left p-2">Date</th>
                        <th className="text-right p-2">Amount</th>
                        <th className="text-right p-2">Tips</th>
                        <th className="text-right p-2">Fees</th>
                        <th className="text-left p-2">Description</th>
                        <th className="text-center p-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedEntries.map((entry) => {
                        const config = PLATFORM_CONFIGS[entry.platform] || PLATFORM_CONFIGS.other;
                        return (
                          <tr key={entry.id} className="border-b hover:bg-muted/30" data-testid={`row-sync-${entry.id}`}>
                            <td className="p-2">
                              {!entry.importedToIncome && (
                                <input
                                  type="checkbox"
                                  checked={selectedIds.has(entry.id)}
                                  onChange={() => toggleSelect(entry.id)}
                                  className="rounded"
                                  data-testid={`checkbox-sync-${entry.id}`}
                                />
                              )}
                            </td>
                            <td className="p-2">
                              <Badge variant="outline" className="text-xs gap-1">
                                <span className={`inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-bold ${config.color}`}>
                                  {config.label[0]}
                                </span>
                                {config.label}
                              </Badge>
                            </td>
                            <td className="p-2">
                              {entry.date ? format(parseISO(entry.date), "MMM d, yyyy") : "—"}
                            </td>
                            <td className="p-2 text-right font-medium">${parseFloat(entry.amount).toFixed(2)}</td>
                            <td className="p-2 text-right text-green-600">{parseFloat(entry.tips || "0") > 0 ? `$${parseFloat(entry.tips!).toFixed(2)}` : "—"}</td>
                            <td className="p-2 text-right text-red-500">{parseFloat(entry.platformFees || "0") > 0 ? `$${parseFloat(entry.platformFees!).toFixed(2)}` : "—"}</td>
                            <td className="p-2 truncate max-w-[150px]">{entry.description || "—"}</td>
                            <td className="p-2 text-center">
                              {entry.importedToIncome ? (
                                <Badge className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 text-xs gap-1">
                                  <CheckCircle className="h-3 w-3" />
                                  Imported
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-xs gap-1">
                                  <Clock className="h-3 w-3" />
                                  Pending
                                </Badge>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {entries.length === 0 && !isLoading && (
          <Card>
            <CardContent className="p-12 text-center">
              <FileSpreadsheet className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-lg font-medium">No earnings synced yet</p>
              <p className="text-muted-foreground mt-1">Upload your first earnings CSV from Uber, Bolt, Lyft, or DoorDash above</p>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
