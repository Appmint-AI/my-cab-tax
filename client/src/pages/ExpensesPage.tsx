import { Layout } from "@/components/Layout";
import { useExpenses, useDeleteExpense } from "@/hooks/use-expenses";
import { useRegion } from "@/hooks/use-region";
import { ExpenseForm } from "@/components/forms/ExpenseForm";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
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
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { MoreVertical, Search, Trash2, Pencil, Receipt, ArrowUpDown, ImageIcon, X } from "lucide-react";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { getSegmentConfig } from "@/lib/segment-config";
import type { Expense } from "@shared/schema";

type SortField = "date" | "amount" | "category";
type SortDir = "asc" | "desc";

export default function ExpensesPage() {
  const { data: expenses, isLoading } = useExpenses();
  const deleteMutation = useDeleteExpense();
  const { formatCurrency } = useRegion();
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const { user } = useAuth();
  const segmentConfig = getSegmentConfig(user?.userSegment);
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const filteredExpenses = expenses
    ?.filter(e => 
      e.category.toLowerCase().includes(search.toLowerCase()) || 
      (e.description && e.description.toLowerCase().includes(search.toLowerCase()))
    )
    .sort((a, b) => {
      let cmp = 0;
      if (sortField === "date") {
        cmp = new Date(a.date).getTime() - new Date(b.date).getTime();
      } else if (sortField === "amount") {
        cmp = Number(a.amount) - Number(b.amount);
      } else if (sortField === "category") {
        cmp = a.category.localeCompare(b.category);
      }
      return sortDir === "desc" ? -cmp : cmp;
    });

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const toggleSelectAll = () => {
    if (!filteredExpenses) return;
    if (selectedIds.size === filteredExpenses.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredExpenses.map(e => e.id)));
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const totalAmount = filteredExpenses?.reduce((sum, e) => sum + Number(e.amount), 0) || 0;

  return (
    <Layout>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold" data-testid="text-expenses-title">Expenses</h1>
          <p className="text-muted-foreground">Manage your deductible expenses. {segmentConfig.receiptOptimization}</p>
        </div>
        <ExpenseForm />
      </div>

      <Card className="border-border/60 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-border/40 bg-muted/20 flex flex-col sm:flex-row gap-4 justify-between items-center">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search expenses..." 
              className="pl-9 bg-background" 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="input-expense-search"
            />
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span>{filteredExpenses?.length || 0} records</span>
            <span className="hidden sm:inline font-medium text-foreground">{formatCurrency(totalAmount)} total</span>
          </div>
        </div>

        {isLoading ? (
          <div className="p-4 space-y-3">
             {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : filteredExpenses && filteredExpenses.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <Table data-testid="table-expenses">
                <TableHeader>
                  <TableRow className="hover:bg-transparent bg-muted/40">
                    <TableHead className="w-[40px] hidden md:table-cell">
                      <Checkbox
                        checked={selectedIds.size === filteredExpenses.length && filteredExpenses.length > 0}
                        onCheckedChange={toggleSelectAll}
                        data-testid="checkbox-select-all-expenses"
                      />
                    </TableHead>
                    <TableHead className="font-semibold text-xs uppercase tracking-wide">
                      <Button variant="ghost" size="sm" className="gap-1 -ml-3 font-semibold text-xs uppercase tracking-wide" onClick={() => toggleSort("date")} data-testid="button-sort-expense-date">
                        Date
                        <ArrowUpDown className="h-3 w-3" />
                      </Button>
                    </TableHead>
                    <TableHead className="font-semibold text-xs uppercase tracking-wide">
                      <Button variant="ghost" size="sm" className="gap-1 -ml-3 font-semibold text-xs uppercase tracking-wide" onClick={() => toggleSort("category")} data-testid="button-sort-expense-category">
                        Category
                        <ArrowUpDown className="h-3 w-3" />
                      </Button>
                    </TableHead>
                    <TableHead className="font-semibold text-xs uppercase tracking-wide">Description</TableHead>
                    <TableHead className="hidden lg:table-cell font-semibold text-xs uppercase tracking-wide">Receipt</TableHead>
                    <TableHead className="text-right font-semibold text-xs uppercase tracking-wide">
                      <Button variant="ghost" size="sm" className="gap-1 -mr-3 ml-auto font-semibold text-xs uppercase tracking-wide" onClick={() => toggleSort("amount")} data-testid="button-sort-expense-amount">
                        Amount
                        <ArrowUpDown className="h-3 w-3" />
                      </Button>
                    </TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredExpenses.map((expense, idx) => (
                    <TableRow key={expense.id} className={`group hover:bg-primary/5 transition-colors ${idx % 2 === 1 ? "bg-muted/20" : ""}`} data-testid={`row-expense-${expense.id}`}>
                      <TableCell className="hidden md:table-cell">
                        <Checkbox
                          checked={selectedIds.has(expense.id)}
                          onCheckedChange={() => toggleSelect(expense.id)}
                          data-testid={`checkbox-expense-${expense.id}`}
                        />
                      </TableCell>
                      <TableCell className="font-medium whitespace-nowrap">
                        {format(new Date(expense.date), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="no-default-active-elevate text-xs">
                          {expense.category}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-muted-foreground">
                        {expense.description || "-"}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        {expense.receiptUrl ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1 text-xs"
                            onClick={() => setPreviewImage(expense.receiptUrl!)}
                            data-testid={`button-view-receipt-${expense.id}`}
                          >
                            <ImageIcon className="h-3 w-3" />
                            View
                          </Button>
                        ) : (
                          <span className="text-muted-foreground text-xs">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-bold font-mono">
                        {formatCurrency(Number(expense.amount))}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="invisible group-hover:visible" data-testid={`button-actions-expense-${expense.id}`}>
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setEditingId(expense.id)}>
                              <Pencil className="mr-2 h-4 w-4" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              className="text-destructive focus:text-destructive"
                              onClick={() => {
                                if(confirm('Are you sure you want to delete this expense?')) {
                                  deleteMutation.mutate(expense.id);
                                }
                              }}
                            >
                              <Trash2 className="mr-2 h-4 w-4" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>

                        {editingId === expense.id && (
                          <ExpenseForm 
                            initialData={expense} 
                            open={true} 
                            onOpenChange={(open) => !open && setEditingId(null)} 
                            trigger={<span className="hidden"></span>}
                          />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <tfoot>
                  <tr className="border-t-2 border-border bg-muted/40">
                    <td className="hidden md:table-cell" />
                    <td colSpan={4} className="px-4 py-2 text-sm font-semibold text-muted-foreground">
                      Total — {filteredExpenses.length} records
                    </td>
                    <td className="hidden lg:table-cell" />
                    <td className="px-4 py-2 text-right font-bold font-mono text-sm text-destructive">
                      {formatCurrency(totalAmount)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </Table>
            </div>

            {selectedIds.size > 0 && (
              <ExpenseBulkActions selectedIds={selectedIds} onClear={() => setSelectedIds(new Set())} />
            )}
          </>
        ) : (
          <div className="p-12 text-center text-muted-foreground flex flex-col items-center">
            <div className="bg-muted p-4 rounded-full mb-4">
              <Receipt className="h-8 w-8 text-muted-foreground/50" />
            </div>
            <p className="text-lg font-medium text-foreground">No expenses found</p>
            <p className="mb-4">Get started by adding your first business expense.</p>
            <ExpenseForm />
          </div>
        )}
      </Card>

      <Dialog open={!!previewImage} onOpenChange={(open) => !open && setPreviewImage(null)}>
        <DialogContent className="sm:max-w-[640px] p-0 overflow-hidden">
          <div className="relative">
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2 z-10 bg-background/80 backdrop-blur-sm"
              onClick={() => setPreviewImage(null)}
              data-testid="button-close-receipt-preview"
            >
              <X className="h-4 w-4" />
            </Button>
            {previewImage && (
              <img
                src={previewImage}
                alt="Receipt"
                className="w-full max-h-[80vh] object-contain bg-muted"
                data-testid="img-receipt-preview"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

function ExpenseBulkActions({ selectedIds, onClear }: { selectedIds: Set<number>; onClear: () => void }) {
  const deleteMutation = useDeleteExpense();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleBulkDelete = () => {
    Array.from(selectedIds).forEach(id => {
      deleteMutation.mutate(id);
    });
    onClear();
    setConfirmOpen(false);
  };

  return (
    <div className="p-3 border-t border-border/40 bg-muted/30 flex items-center justify-between gap-4 flex-wrap" data-testid="bulk-actions-expenses">
      <span className="text-sm text-muted-foreground">{selectedIds.size} item{selectedIds.size !== 1 ? "s" : ""} selected</span>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onClear} data-testid="button-clear-expense-selection">
          Clear
        </Button>
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="sm" data-testid="button-bulk-delete-expenses">
              <Trash2 className="h-3 w-3 mr-1" />
              Delete Selected
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {selectedIds.size} Expenses</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently remove {selectedIds.size} expense record{selectedIds.size !== 1 ? "s" : ""}. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleBulkDelete}>
                Delete {selectedIds.size} Expenses
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
