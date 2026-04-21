import { Layout } from "@/components/Layout";
import { useIncomes, useDeleteIncome } from "@/hooks/use-incomes";
import { useRegion } from "@/hooks/use-region";
import { IncomeForm } from "@/components/forms/IncomeForm";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { MoreVertical, Search, Trash2, Pencil, Wallet } from "lucide-react";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { getSegmentConfig } from "@/lib/segment-config";

export default function IncomesPage() {
  const { data: incomes, isLoading } = useIncomes();
  const deleteMutation = useDeleteIncome();
  const { formatCurrency } = useRegion();
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const { user } = useAuth();
  const segmentConfig = getSegmentConfig(user?.userSegment);

  const filteredIncomes = incomes?.filter(i => 
    i.source.toLowerCase().includes(search.toLowerCase()) || 
    (i.description && i.description.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <Layout>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold" data-testid="text-incomes-title">Income Logs</h1>
          <p className="text-muted-foreground">Track your {segmentConfig.earningsLabel.toLowerCase()}, miles driven, and platform fees.</p>
        </div>
        <IncomeForm />
      </div>

      <Card className="border-border/60 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-border/40 bg-muted/20 flex flex-col sm:flex-row gap-4 justify-between items-center">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              data-testid="input-search-incomes"
              placeholder="Search incomes..." 
              className="pl-9 bg-background" 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="text-sm text-muted-foreground">
            {filteredIncomes?.length || 0} records found
          </div>
        </div>

        {isLoading ? (
          <div className="p-4 space-y-3">
             {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : filteredIncomes && filteredIncomes.length > 0 ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent bg-muted/40">
                  <TableHead className="font-semibold text-xs uppercase tracking-wide">Date</TableHead>
                  <TableHead className="font-semibold text-xs uppercase tracking-wide">Source</TableHead>
                  <TableHead className="font-semibold text-xs uppercase tracking-wide">Description</TableHead>
                  <TableHead className="text-right font-semibold text-xs uppercase tracking-wide">Miles</TableHead>
                  <TableHead className="text-right font-semibold text-xs uppercase tracking-wide">Fees</TableHead>
                  <TableHead className="text-right font-semibold text-xs uppercase tracking-wide">Gross</TableHead>
                  <TableHead className="text-right font-semibold text-xs uppercase tracking-wide hidden lg:table-cell">Net Earned</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredIncomes.map((income, idx) => {
                  const gross = Number(income.amount);
                  const fees = Number(income.platformFees || 0);
                  const net = gross - fees;
                  return (
                  <TableRow
                    key={income.id}
                    className={`group hover:bg-primary/5 transition-colors ${idx % 2 === 1 ? "bg-muted/20" : ""}`}
                    data-testid={`row-income-${income.id}`}
                  >
                    <TableCell className="font-medium text-sm whitespace-nowrap">
                      {format(new Date(income.date), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 border border-green-200 dark:border-green-800">
                          {income.source}
                        </span>
                        {income.isTips && (
                          <Badge variant="outline" className="text-[10px] border-green-400 text-green-700 dark:text-green-300 no-default-active-elevate" data-testid={`badge-tips-${income.id}`}>
                            Tips (Tax-Exempt)
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-muted-foreground text-sm">
                      {income.description || "-"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-muted-foreground">
                      {Number(income.miles || 0) > 0 ? Number(income.miles).toFixed(1) : "-"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-red-500">
                      {fees > 0 ? `-${formatCurrency(fees)}` : "-"}
                    </TableCell>
                    <TableCell className="text-right font-bold font-mono text-sm text-green-600 dark:text-green-400">
                      +{formatCurrency(gross)}
                    </TableCell>
                    <TableCell className="text-right font-bold font-mono text-sm text-foreground hidden lg:table-cell">
                      {formatCurrency(net)}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" data-testid={`button-income-menu-${income.id}`}>
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setEditingId(income.id)}>
                            <Pencil className="mr-2 h-4 w-4" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            className="text-destructive focus:text-destructive"
                            onClick={() => {
                              if(confirm('Are you sure you want to delete this income record?')) {
                                deleteMutation.mutate(income.id);
                              }
                            }}
                          >
                            <Trash2 className="mr-2 h-4 w-4" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>

                      {editingId === income.id && (
                        <IncomeForm 
                          initialData={income} 
                          open={true} 
                          onOpenChange={(open) => !open && setEditingId(null)} 
                          trigger={<span className="hidden"></span>}
                        />
                      )}
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
              <tfoot>
                <tr className="border-t-2 border-border bg-muted/40">
                  <td colSpan={5} className="px-4 py-2 text-sm font-semibold text-muted-foreground">
                    Totals — {filteredIncomes.length} records
                  </td>
                  <td className="px-4 py-2 text-right font-bold font-mono text-sm text-green-600 dark:text-green-400">
                    +{formatCurrency(filteredIncomes.reduce((s, i) => s + Number(i.amount), 0))}
                  </td>
                  <td className="px-4 py-2 text-right font-bold font-mono text-sm hidden lg:table-cell">
                    {formatCurrency(filteredIncomes.reduce((s, i) => s + Number(i.amount) - Number(i.platformFees || 0), 0))}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </Table>
          </div>
        ) : (
          <div className="p-12 text-center text-muted-foreground flex flex-col items-center">
            <div className="bg-muted p-4 rounded-full mb-4">
              <Wallet className="h-8 w-8 text-muted-foreground/50" />
            </div>
            <p className="text-lg font-medium text-foreground">No income records found</p>
            <p className="mb-4">Start tracking your earnings today.</p>
            <IncomeForm />
          </div>
        )}
      </Card>
    </Layout>
  );
}
