import { useState } from "react";
import { Layout } from "@/components/Layout";
import { useMileageLogs, useCreateMileageLog, useDeleteMileageLog } from "@/hooks/use-mileage-logs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertMileageLogSchema, IRS_MILEAGE_RATE, type MileageLog } from "@shared/schema";
import { z } from "zod";
import { Plus, Loader2, Trash2, Car, MapPin, Calendar, TrendingUp, Search, MoreVertical, ArrowUpDown, LayoutList, LayoutGrid } from "lucide-react";
import { format, parseISO } from "date-fns";
import { useTaxSummary } from "@/hooks/use-tax";
import { useVehicles } from "@/hooks/use-vehicles";

const formSchema = insertMileageLogSchema.extend({
  totalMiles: z.coerce.number().positive("Miles must be positive"),
  date: z.string().min(1, "Date is required"),
  startOdometer: z.coerce.number().min(0).optional().nullable(),
  endOdometer: z.coerce.number().min(0).optional().nullable(),
});

const businessPurposes = [
  "Shift Start to Shift End",
  "Fare to Airport",
  "Fare to Destination",
  "Between Rides (Repositioning)",
  "To/From Maintenance",
  "Other Business Purpose",
];

type SortField = "date" | "totalMiles" | "businessPurpose" | "tripState";
type SortDir = "asc" | "desc";

export default function MileagePage() {
  const { data: logs, isLoading } = useMileageLogs();
  const { data: summary } = useTaxSummary();
  const [formOpen, setFormOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"table" | "card">("table");
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const totalLoggedMiles = logs?.reduce((sum, log) => sum + Number(log.totalMiles), 0) || 0;
  const mileageDeduction = totalLoggedMiles * IRS_MILEAGE_RATE;

  const filteredLogs = logs
    ?.filter(log =>
      log.businessPurpose.toLowerCase().includes(search.toLowerCase()) ||
      (log.tripState && log.tripState.toLowerCase().includes(search.toLowerCase())) ||
      log.date.includes(search)
    )
    .sort((a, b) => {
      let cmp = 0;
      if (sortField === "date") {
        cmp = new Date(a.date).getTime() - new Date(b.date).getTime();
      } else if (sortField === "totalMiles") {
        cmp = Number(a.totalMiles) - Number(b.totalMiles);
      } else if (sortField === "businessPurpose") {
        cmp = a.businessPurpose.localeCompare(b.businessPurpose);
      } else if (sortField === "tripState") {
        cmp = (a.tripState || "").localeCompare(b.tripState || "");
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
    if (!filteredLogs) return;
    if (selectedIds.size === filteredLogs.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredLogs.map(l => l.id)));
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

  return (
    <Layout>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold" data-testid="text-mileage-title">Mileage Tracker</h1>
          <p className="text-muted-foreground">IRS-compliant contemporaneous mileage log (Publication 463).</p>
        </div>
        <MileageLogForm open={formOpen} onOpenChange={setFormOpen} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card className="border-border/60 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Logged Miles</CardTitle>
            <div className="p-2 rounded-full bg-orange-100 dark:bg-orange-900/30">
              <Car className="h-4 w-4 text-orange-600 dark:text-orange-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-display" data-testid="text-total-logged-miles">
              {totalLoggedMiles.toLocaleString(undefined, { maximumFractionDigits: 1 })}
            </div>
            <p className="text-xs text-muted-foreground mt-1">miles from mileage log</p>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Mileage Deduction</CardTitle>
            <div className="p-2 rounded-full bg-green-100 dark:bg-green-900/30">
              <MapPin className="h-4 w-4 text-green-600 dark:text-green-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-display" data-testid="text-mileage-deduction-value">
              ${mileageDeduction.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-muted-foreground mt-1">at ${IRS_MILEAGE_RATE}/mi (IRS 2026 Standard Rate)</p>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Entries</CardTitle>
            <div className="p-2 rounded-full bg-blue-100 dark:bg-blue-900/30">
              <Calendar className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-display" data-testid="text-total-entries">
              {logs?.length || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">mileage log entries</p>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-6 border-green-200/60 dark:border-green-800/40 bg-green-50/30 dark:bg-green-950/20 shadow-sm" data-testid="card-mileage-rate-banner">
        <CardContent className="flex items-start gap-3 py-3 px-4">
          <TrendingUp className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-medium text-green-900 dark:text-green-200">
                2026 IRS Standard Mileage Rate: ${IRS_MILEAGE_RATE}/mile
              </p>
              <Badge variant="outline" className="text-[10px] border-green-400 text-green-700 dark:text-green-300 no-default-active-elevate" data-testid="badge-mileage-rate">
                Up 2.5&#162; from 2025
              </Badge>
            </div>
            <p className="text-xs text-green-800/70 dark:text-green-300/70 mt-1 leading-relaxed">
              The IRS increased the standard mileage rate to 72.5&#162; per business mile for 2026. This rate covers gas, insurance, depreciation, and maintenance. Keep contemporaneous records per IRS Pub. 463 to substantiate your deduction.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-sm">
        <div className="p-4 border-b border-border/40 bg-muted/20 flex flex-col sm:flex-row gap-4 justify-between items-center">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search mileage logs..."
                className="pl-9 bg-background"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                data-testid="input-mileage-search"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{filteredLogs?.length || 0} records</span>
            <div className="hidden md:flex items-center border border-border rounded-md">
              <Button
                variant={viewMode === "table" ? "secondary" : "ghost"}
                size="sm"
                className="rounded-r-none"
                onClick={() => setViewMode("table")}
                data-testid="button-view-table"
              >
                <LayoutList className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === "card" ? "secondary" : "ghost"}
                size="sm"
                className="rounded-l-none"
                onClick={() => setViewMode("card")}
                data-testid="button-view-card"
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : !filteredLogs || filteredLogs.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground flex flex-col items-center">
            <div className="bg-muted p-4 rounded-full mb-4">
              <Car className="h-8 w-8 text-muted-foreground/50" />
            </div>
            <p className="text-lg font-medium text-foreground">No mileage entries found</p>
            <p className="mb-4">Start logging your business miles to maximize your deduction.</p>
            <MileageLogForm open={formOpen} onOpenChange={setFormOpen} />
          </div>
        ) : viewMode === "table" ? (
          <div className="overflow-x-auto">
            <Table data-testid="table-mileage-logs">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[40px] hidden md:table-cell">
                    <Checkbox
                      checked={selectedIds.size === filteredLogs.length && filteredLogs.length > 0}
                      onCheckedChange={toggleSelectAll}
                      data-testid="checkbox-select-all-mileage"
                    />
                  </TableHead>
                  <TableHead>
                    <Button variant="ghost" size="sm" className="gap-1 -ml-3" onClick={() => toggleSort("date")} data-testid="button-sort-date">
                      Date
                      <ArrowUpDown className="h-3 w-3" />
                    </Button>
                  </TableHead>
                  <TableHead>
                    <Button variant="ghost" size="sm" className="gap-1 -ml-3" onClick={() => toggleSort("businessPurpose")} data-testid="button-sort-purpose">
                      Business Purpose
                      <ArrowUpDown className="h-3 w-3" />
                    </Button>
                  </TableHead>
                  <TableHead className="hidden lg:table-cell">
                    <Button variant="ghost" size="sm" className="gap-1 -ml-3" onClick={() => toggleSort("tripState")} data-testid="button-sort-state">
                      State
                      <ArrowUpDown className="h-3 w-3" />
                    </Button>
                  </TableHead>
                  <TableHead className="hidden xl:table-cell">Odometer</TableHead>
                  <TableHead className="text-right">
                    <Button variant="ghost" size="sm" className="gap-1 -mr-3 ml-auto" onClick={() => toggleSort("totalMiles")} data-testid="button-sort-miles">
                      Miles
                      <ArrowUpDown className="h-3 w-3" />
                    </Button>
                  </TableHead>
                  <TableHead className="text-right hidden md:table-cell">Deduction</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.map((log) => (
                  <MileageTableRow
                    key={log.id}
                    log={log}
                    selected={selectedIds.has(log.id)}
                    onToggleSelect={() => toggleSelect(log.id)}
                  />
                ))}
              </TableBody>
            </Table>
            {selectedIds.size > 0 && (
              <BulkActions selectedIds={selectedIds} onClear={() => setSelectedIds(new Set())} />
            )}
          </div>
        ) : (
          <CardContent className="space-y-2 pt-4">
            {filteredLogs.map((log) => (
              <MileageLogRow key={log.id} log={log} />
            ))}
          </CardContent>
        )}
      </Card>

      <Card className="border-border/60 shadow-sm mt-4">
        <CardContent className="py-4">
          <p className="text-xs text-muted-foreground leading-relaxed" data-testid="text-mileage-irs-notice">
            The IRS requires a contemporaneous record of business miles driven. Each entry should include the date, business purpose, and total miles. Odometer readings are recommended but not required. My Cab Tax USA uses the Standard Mileage Rate method (${IRS_MILEAGE_RATE}/mi for 2026) per IRS Publication 463. Drivers should cross-reference logs with their vehicle's odometer.
          </p>
        </CardContent>
      </Card>
    </Layout>
  );
}

function MileageTableRow({ log, selected, onToggleSelect }: { log: MileageLog; selected: boolean; onToggleSelect: () => void }) {
  const deleteMutation = useDeleteMileageLog();
  const deduction = Number(log.totalMiles) * IRS_MILEAGE_RATE;

  return (
    <TableRow className="group hover:bg-muted/30" data-testid={`row-mileage-${log.id}`}>
      <TableCell className="hidden md:table-cell">
        <Checkbox
          checked={selected}
          onCheckedChange={onToggleSelect}
          data-testid={`checkbox-mileage-${log.id}`}
        />
      </TableCell>
      <TableCell className="font-medium whitespace-nowrap">
        {format(parseISO(log.date), "MMM d, yyyy")}
      </TableCell>
      <TableCell>
        <Badge variant="secondary" className="no-default-active-elevate text-xs">
          {log.businessPurpose}
        </Badge>
      </TableCell>
      <TableCell className="hidden lg:table-cell">
        {log.tripState || <span className="text-muted-foreground">-</span>}
      </TableCell>
      <TableCell className="hidden xl:table-cell text-muted-foreground text-sm font-mono">
        {log.startOdometer && log.endOdometer
          ? `${Number(log.startOdometer).toLocaleString()} - ${Number(log.endOdometer).toLocaleString()}`
          : "-"}
      </TableCell>
      <TableCell className="text-right font-bold font-mono">
        {Number(log.totalMiles).toLocaleString(undefined, { maximumFractionDigits: 1 })}
      </TableCell>
      <TableCell className="text-right font-mono text-muted-foreground hidden md:table-cell">
        ${deduction.toFixed(2)}
      </TableCell>
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="invisible group-hover:visible" data-testid={`button-actions-mileage-${log.id}`}>
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => {
                if (confirm("Are you sure you want to delete this mileage entry?")) {
                  deleteMutation.mutate(log.id);
                }
              }}
            >
              <Trash2 className="mr-2 h-4 w-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}

function BulkActions({ selectedIds, onClear }: { selectedIds: Set<number>; onClear: () => void }) {
  const deleteMutation = useDeleteMileageLog();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleBulkDelete = async () => {
    Array.from(selectedIds).forEach(id => {
      deleteMutation.mutate(id);
    });
    onClear();
    setConfirmOpen(false);
  };

  return (
    <div className="p-3 border-t border-border/40 bg-muted/30 flex items-center justify-between gap-4 flex-wrap" data-testid="bulk-actions-mileage">
      <span className="text-sm text-muted-foreground">{selectedIds.size} item{selectedIds.size !== 1 ? "s" : ""} selected</span>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onClear} data-testid="button-clear-selection">
          Clear
        </Button>
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="sm" data-testid="button-bulk-delete-mileage">
              <Trash2 className="h-3 w-3 mr-1" />
              Delete Selected
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {selectedIds.size} Mileage Entries</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently remove {selectedIds.size} mileage record{selectedIds.size !== 1 ? "s" : ""}. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleBulkDelete}>
                Delete {selectedIds.size} Entries
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

function MileageLogRow({ log }: { log: MileageLog }) {
  const deleteMutation = useDeleteMileageLog();

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-border/60 bg-background" data-testid={`card-mileage-${log.id}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">{format(parseISO(log.date), "MMM d, yyyy")}</span>
          <Badge variant="secondary" className="text-xs no-default-active-elevate">{log.businessPurpose}</Badge>
          {log.tripState && <Badge variant="outline" className="text-xs no-default-active-elevate">{log.tripState}</Badge>}
        </div>
        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
          <span>{Number(log.totalMiles).toLocaleString(undefined, { maximumFractionDigits: 1 })} miles</span>
          <span>${(Number(log.totalMiles) * IRS_MILEAGE_RATE).toFixed(2)} deduction</span>
          {log.startOdometer && log.endOdometer && (
            <span>Odometer: {Number(log.startOdometer).toLocaleString()} - {Number(log.endOdometer).toLocaleString()}</span>
          )}
        </div>
      </div>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" size="icon" data-testid={`button-delete-mileage-${log.id}`}>
            <Trash2 className="h-4 w-4 text-muted-foreground" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Mileage Entry</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this mileage record. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate(log.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function MileageLogForm({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const createMutation = useCreateMileageLog();
  const { data: vehicles } = useVehicles();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      date: new Date().toISOString().split('T')[0],
      businessPurpose: "Shift Start to Shift End",
      totalMiles: "" as any,
      startOdometer: null,
      endOdometer: null,
      vehicleId: null,
      tripState: "",
    },
  });

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    createMutation.mutate(values, {
      onSuccess: () => {
        onOpenChange(false);
        form.reset();
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button data-testid="button-add-mileage">
          <Plus className="mr-2 h-5 w-5" />
          Log Miles
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Log Business Miles</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
            <FormField
              control={form.control}
              name="date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Date</FormLabel>
                  <FormControl>
                    <Input data-testid="input-mileage-date" type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="businessPurpose"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Business Purpose</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-mileage-purpose">
                        <SelectValue placeholder="Select purpose" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {businessPurposes.map((purpose) => (
                        <SelectItem key={purpose} value={purpose}>
                          {purpose}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {vehicles && vehicles.length > 0 && (
              <FormField
                control={form.control}
                name="vehicleId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vehicle</FormLabel>
                    <Select
                      onValueChange={(val) => field.onChange(val === "none" ? null : Number(val))}
                      defaultValue={field.value ? String(field.value) : "none"}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-mileage-vehicle">
                          <SelectValue placeholder="Select vehicle" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">No vehicle assigned</SelectItem>
                        {vehicles.map((v) => (
                          <SelectItem key={v.id} value={String(v.id)}>
                            {v.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="totalMiles"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Total Miles</FormLabel>
                  <FormControl>
                    <Input
                      data-testid="input-mileage-total"
                      type="number"
                      step="0.1"
                      placeholder="0.0"
                      className="text-lg font-medium"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="startOdometer"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start Odometer</FormLabel>
                    <FormControl>
                      <Input
                        data-testid="input-mileage-start-odo"
                        type="number"
                        placeholder="Optional"
                        {...field}
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : null)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="endOdometer"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>End Odometer</FormLabel>
                    <FormControl>
                      <Input
                        data-testid="input-mileage-end-odo"
                        type="number"
                        placeholder="Optional"
                        {...field}
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : null)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="tripState"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Trip State</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value ?? ""}>
                    <FormControl>
                      <SelectTrigger data-testid="select-mileage-trip-state">
                        <SelectValue placeholder="State where trip occurred (optional)" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC"].map((st) => (
                        <SelectItem key={st} value={st}>{st}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button data-testid="button-submit-mileage" type="submit" className="w-full" disabled={createMutation.isPending}>
              {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Record Mileage
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
