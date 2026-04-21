import { useState, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FileSpreadsheet, Upload, Loader2, Check, Download, AlertTriangle } from "lucide-react";

interface StatementEntry {
  date: string;
  grossEarnings: number;
  platformFees: number;
  tips: number;
  netPayout: number;
  description: string;
}

interface ParsedStatement {
  platform: string;
  periodStart: string;
  periodEnd: string;
  entries: StatementEntry[];
  totals: {
    grossEarnings: number;
    platformFees: number;
    tips: number;
    netPayout: number;
  };
}

export function StatementParser() {
  const [open, setOpen] = useState(false);
  const [parsed, setParsed] = useState<ParsedStatement | null>(null);
  const [importing, setImporting] = useState(false);
  const [importedCount, setImportedCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const parseMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("statement", file);
      const res = await fetch("/api/parse-statement", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to parse statement");
      }
      return res.json() as Promise<ParsedStatement>;
    },
    onSuccess: (data) => {
      setParsed(data);
    },
    onError: (err: Error) => {
      toast({ title: "Parse Error", description: err.message, variant: "destructive" });
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParsed(null);
    setImportedCount(0);
    parseMutation.mutate(file);
  };

  const importAll = async () => {
    if (!parsed || parsed.entries.length === 0) return;
    setImporting(true);
    let count = 0;

    for (const entry of parsed.entries) {
      try {
        if (entry.grossEarnings > 0) {
          await apiRequest("POST", "/api/incomes", {
            date: entry.date,
            amount: entry.grossEarnings,
            source: parsed.platform || "Statement Import",
            description: entry.description || `${parsed.platform} earnings`,
            platformFees: entry.platformFees || 0,
            isTips: false,
          });
          count++;
        }
        if (entry.tips > 0) {
          await apiRequest("POST", "/api/incomes", {
            date: entry.date,
            amount: entry.tips,
            source: parsed.platform || "Statement Import",
            description: `${parsed.platform} tips`,
            platformFees: 0,
            isTips: true,
          });
          count++;
        }
      } catch {
        // continue with remaining entries
      }
    }

    setImporting(false);
    setImportedCount(count);
    queryClient.invalidateQueries({ queryKey: ["/api/incomes"] });
    queryClient.invalidateQueries({ queryKey: ["/api/tax-summary"] });
    toast({
      title: "Import Complete",
      description: `${count} income entries imported from ${parsed.platform || "statement"}.`,
    });
  };

  const reset = () => {
    setParsed(null);
    setImportedCount(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" data-testid="button-statement-parser">
          <FileSpreadsheet className="mr-2 h-4 w-4" />
          Import Statement
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle data-testid="text-statement-parser-title">AI Statement Parser</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div
            className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => fileInputRef.current?.click()}
            data-testid="dropzone-statement"
          >
            <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              Upload your earnings statement PDF (Uber, Lyft, DoorDash, etc.)
            </p>
            <p className="text-xs text-muted-foreground mt-1">Pro feature — AI-powered parsing</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={handleFileChange}
              data-testid="input-statement-file"
            />
          </div>

          {parseMutation.isPending && (
            <div className="flex items-center justify-center gap-2 py-6">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">AI is analyzing your statement...</span>
            </div>
          )}

          {parsed && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base" data-testid="text-parsed-platform">
                    {parsed.platform || "Earnings Statement"}
                  </CardTitle>
                  <Badge variant="outline" data-testid="badge-entry-count">
                    {parsed.entries.length} entries
                  </Badge>
                </div>
                {parsed.periodStart && parsed.periodEnd && (
                  <p className="text-xs text-muted-foreground" data-testid="text-parsed-period">
                    Period: {parsed.periodStart} to {parsed.periodEnd}
                  </p>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-1.5 pr-2">Date</th>
                        <th className="text-right py-1.5 px-2">Gross</th>
                        <th className="text-right py-1.5 px-2">Fees</th>
                        <th className="text-right py-1.5 px-2">Tips</th>
                        <th className="text-right py-1.5 pl-2">Net</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsed.entries.map((entry, i) => (
                        <tr key={i} className="border-b border-border/40" data-testid={`row-statement-entry-${i}`}>
                          <td className="py-1.5 pr-2">{entry.date}</td>
                          <td className="text-right py-1.5 px-2">${entry.grossEarnings.toFixed(2)}</td>
                          <td className="text-right py-1.5 px-2 text-destructive">-${entry.platformFees.toFixed(2)}</td>
                          <td className="text-right py-1.5 px-2 text-green-600">${entry.tips.toFixed(2)}</td>
                          <td className="text-right py-1.5 pl-2 font-medium">${entry.netPayout.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="font-medium border-t-2">
                        <td className="py-1.5 pr-2">Totals</td>
                        <td className="text-right py-1.5 px-2">${parsed.totals.grossEarnings.toFixed(2)}</td>
                        <td className="text-right py-1.5 px-2 text-destructive">-${parsed.totals.platformFees.toFixed(2)}</td>
                        <td className="text-right py-1.5 px-2 text-green-600">${parsed.totals.tips.toFixed(2)}</td>
                        <td className="text-right py-1.5 pl-2">${parsed.totals.netPayout.toFixed(2)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {importedCount > 0 ? (
                  <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 dark:bg-green-950/30 rounded-md p-3">
                    <Check className="h-4 w-4" />
                    <span data-testid="text-import-success">{importedCount} entries imported successfully</span>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Button onClick={importAll} disabled={importing} className="flex-1" data-testid="button-import-all">
                      {importing ? (
                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Importing...</>
                      ) : (
                        <><Download className="mr-2 h-4 w-4" /> Import All as Income</>
                      )}
                    </Button>
                    <Button variant="outline" onClick={reset} data-testid="button-reset-statement">
                      Clear
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
