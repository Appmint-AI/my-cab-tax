import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertIncomeSchema, type InsertIncome } from "@shared/schema";
import { useCreateIncome, useUpdateIncome } from "@/hooks/use-incomes";
import { useSubscription } from "@/hooks/use-subscription";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useState, useEffect } from "react";
import { Plus, Loader2, Zap, Lock, DollarSign } from "lucide-react";
import { z } from "zod";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { getSegmentConfig } from "@/lib/segment-config";

const formSchema = insertIncomeSchema.extend({
  amount: z.coerce.number().positive("Amount must be positive"),
  date: z.string().min(1, "Date is required"),
  miles: z.coerce.number().min(0).optional().default(0),
  platformFees: z.coerce.number().min(0).optional().default(0),
  isTips: z.boolean().optional().default(false),
});

interface IncomeFormProps {
  initialData?: InsertIncome & { id: number; miles?: string | number | null; platformFees?: string | number | null };
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: React.ReactNode;
}

export function IncomeForm({ initialData, open: controlledOpen, onOpenChange: setControlledOpen, trigger }: IncomeFormProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = controlledOpen ?? internalOpen;
  const setOpen = setControlledOpen ?? setInternalOpen;
  const [autoGrossMode, setAutoGrossMode] = useState(false);
  const [netPayout, setNetPayout] = useState<number>(0);
  const [commissionRate, setCommissionRate] = useState(0.25);

  const { data: subscription } = useSubscription();
  const isPro = subscription?.tier === "pro";

  const createMutation = useCreateIncome();
  const updateMutation = useUpdateIncome();
  const isPending = createMutation.isPending || updateMutation.isPending;

  const calculatedGross = netPayout > 0 ? netPayout / (1 - commissionRate) : 0;
  const calculatedFee = calculatedGross - netPayout;

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      amount: initialData?.amount ?? ("" as any),
      source: initialData?.source ?? "",
      date: initialData?.date ? new Date(initialData.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      description: initialData?.description ?? "",
      miles: initialData?.miles ? Number(initialData.miles) : 0,
      platformFees: initialData?.platformFees ? Number(initialData.platformFees) : 0,
      payeeState: (initialData as any)?.payeeState ?? "",
      isTips: (initialData as any)?.isTips ?? false,
    },
  });

  useEffect(() => {
    if (autoGrossMode && netPayout > 0) {
      form.setValue("amount", Math.round(calculatedGross * 100) / 100);
      form.setValue("platformFees", Math.round(calculatedFee * 100) / 100);
    }
  }, [netPayout, commissionRate, autoGrossMode, calculatedGross, calculatedFee, form]);

  useEffect(() => {
    if (initialData) {
      form.reset({
        amount: initialData.amount,
        source: initialData.source,
        date: new Date(initialData.date).toISOString().split('T')[0],
        description: initialData.description ?? "",
        miles: initialData.miles ? Number(initialData.miles) : 0,
        platformFees: initialData.platformFees ? Number(initialData.platformFees) : 0,
        payeeState: (initialData as any)?.payeeState ?? "",
        isTips: (initialData as any)?.isTips ?? false,
      });
    }
  }, [initialData, form]);

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    const submitValues = { ...values };
    if (autoGrossMode && netPayout > 0) {
      submitValues.description = submitValues.description || `Auto-Grossed from $${netPayout.toFixed(2)} net payout`;
    }

    if (initialData) {
      updateMutation.mutate(
        { id: initialData.id, ...submitValues },
        { onSuccess: () => setOpen(false) }
      );
    } else {
      createMutation.mutate(submitValues, {
        onSuccess: () => {
          setOpen(false);
          form.reset();
          setAutoGrossMode(false);
          setNetPayout(0);
        },
      });
    }
  };

  const { user } = useAuth();
  const segmentConfig = getSegmentConfig(user?.userSegment);
  const sources = [...segmentConfig.incomeSources, "Tips", "Cash", "Other"];

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      {!trigger && !initialData && (
        <DialogTrigger asChild>
          <Button data-testid="button-add-income">
            <Plus className="mr-2 h-5 w-5" />
            Add Income
          </Button>
        </DialogTrigger>
      )}
      
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{initialData ? "Edit Income" : "Add New Income"}</DialogTitle>
        </DialogHeader>

        {!initialData && (
          <div className="flex items-center justify-between gap-2 p-3 rounded-md border border-border/60 bg-muted/30">
            <div className="flex items-center gap-2">
              {isPro ? (
                <Zap className="h-4 w-4 text-primary" />
              ) : (
                <Lock className="h-4 w-4 text-muted-foreground" />
              )}
              <span className="text-sm font-medium">Auto-Grossing</span>
              {!isPro && (
                <Link href="/upgrade">
                  <Badge variant="secondary" className="text-xs cursor-pointer" data-testid="badge-auto-gross-pro">
                    Pro
                  </Badge>
                </Link>
              )}
            </div>
            <Switch
              checked={autoGrossMode}
              onCheckedChange={setAutoGrossMode}
              disabled={!isPro}
              data-testid="switch-auto-gross-toggle"
            />
          </div>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-2">
            {autoGrossMode && isPro ? (
              <>
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium">Net Payout (Bank Deposit)</label>
                    <p className="text-xs text-muted-foreground mb-1.5">The amount that hit your bank account</p>
                    <Input
                      data-testid="input-auto-gross-net-inline"
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      className="text-lg font-medium"
                      value={netPayout || ""}
                      onChange={(e) => setNetPayout(Number(e.target.value) || 0)}
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium">Commission Rate</label>
                    <Select
                      value={String(commissionRate)}
                      onValueChange={(v) => setCommissionRate(Number(v))}
                    >
                      <SelectTrigger data-testid="select-auto-gross-rate">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0.20">20% (Lyft typical)</SelectItem>
                        <SelectItem value="0.25">25% (Uber typical)</SelectItem>
                        <SelectItem value="0.30">30% (High commission)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {netPayout > 0 && (
                    <Card className="border-primary/30 bg-primary/5">
                      <CardContent className="py-3 px-4 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs text-muted-foreground">Gross (1099-K match)</span>
                          <span className="text-sm font-bold text-primary" data-testid="text-auto-gross-preview">
                            ${calculatedGross.toFixed(2)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs text-muted-foreground">Fee deduction</span>
                          <span className="text-xs font-medium" data-testid="text-auto-fee-preview">
                            -${calculatedFee.toFixed(2)}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </>
            ) : (
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Gross Earnings ($)</FormLabel>
                    <FormControl>
                      <Input 
                        data-testid="input-income-amount"
                        type="number" 
                        step="0.01" 
                        placeholder="0.00" 
                        className="text-lg font-medium" 
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="isTips"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between gap-2 p-3 rounded-md border border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20">
                    <div className="flex items-center gap-2 min-w-0">
                      <DollarSign className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
                      <div>
                        <span className="text-sm font-medium">Tips / Gratuities</span>
                        <p className="text-xs text-muted-foreground">2026: Tips are exempt from federal income tax</p>
                      </div>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-is-tips"
                      />
                    </FormControl>
                  </div>
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="miles"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Miles Driven</FormLabel>
                    <FormControl>
                      <Input 
                        data-testid="input-income-miles"
                        type="number" 
                        step="0.1" 
                        placeholder="0" 
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {!autoGrossMode && (
                <FormField
                  control={form.control}
                  name="platformFees"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Platform Fees ($)</FormLabel>
                      <FormControl>
                        <Input 
                          data-testid="input-income-fees"
                          type="number" 
                          step="0.01" 
                          placeholder="0.00" 
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>

            <FormField
              control={form.control}
              name="source"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Source</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-income-source">
                        <SelectValue placeholder="Select a source" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {sources.map((source) => (
                        <SelectItem key={source} value={source}>
                          {source}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="payeeState"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>1099-K Payee State</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value ?? ""}>
                    <FormControl>
                      <SelectTrigger data-testid="select-income-payee-state">
                        <SelectValue placeholder="State on 1099-K (optional)" />
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

            <FormField
              control={form.control}
              name="date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Date</FormLabel>
                  <FormControl>
                    <Input data-testid="input-income-date" type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (Optional)</FormLabel>
                  <FormControl>
                    <Input data-testid="input-income-description" placeholder="Trip details, etc." {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button data-testid="button-submit-income" type="submit" className="w-full" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {autoGrossMode && isPro ? "Import & Gross-Up" : (initialData ? "Save Changes" : "Create Record")}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
