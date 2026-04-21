import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAutoGross, useSubscription, useCreateCheckoutSession } from "@/hooks/use-subscription";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
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
import { useState } from "react";
import { Loader2, Lock, Crown, Zap, ArrowRight, Info } from "lucide-react";
import { z } from "zod";
import { Link } from "wouter";

const autoGrossSchema = z.object({
  netPayout: z.coerce.number().positive("Net payout must be positive"),
  source: z.string().min(1, "Source is required"),
  date: z.string().min(1, "Date is required"),
  description: z.string().optional().default(""),
  commissionRate: z.coerce.number().min(0.01).max(0.99).optional().default(0.25),
});

export function AutoGrossForm() {
  const [open, setOpen] = useState(false);
  const { data: subscription } = useSubscription();
  const autoGrossMutation = useAutoGross();
  const checkoutMutation = useCreateCheckoutSession();
  const queryClient = useQueryClient();
  const isPro = subscription?.tier === "pro";

  const form = useForm<z.infer<typeof autoGrossSchema>>({
    resolver: zodResolver(autoGrossSchema),
    defaultValues: {
      netPayout: "" as any,
      source: "Uber",
      date: new Date().toISOString().split("T")[0],
      description: "",
      commissionRate: 0.25,
    },
  });

  const netPayout = form.watch("netPayout") || 0;
  const commissionRate = form.watch("commissionRate") || 0.25;
  const calculatedGross = Number(netPayout) > 0 ? Number(netPayout) / (1 - Number(commissionRate)) : 0;
  const calculatedFee = calculatedGross - Number(netPayout);

  const onSubmit = (values: z.infer<typeof autoGrossSchema>) => {
    autoGrossMutation.mutate(values, {
      onSuccess: () => {
        setOpen(false);
        form.reset();
        queryClient.invalidateQueries({ queryKey: [api.incomes.list.path] });
        queryClient.invalidateQueries({ queryKey: [api.tax.summary.path] });
      },
    });
  };

  const sources = ["Uber", "Lyft"];

  if (!isPro) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" data-testid="button-auto-import-locked">
            <Lock className="mr-2 h-4 w-4" />
            Auto-Import (Pro)
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Crown className="h-5 w-5 text-primary" />
              Unlock Auto-Grossing
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="flex items-start gap-3 p-4 rounded-md bg-primary/5 border border-primary/20">
              <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div className="text-sm leading-relaxed">
                <p className="font-medium mb-2" data-testid="text-auto-gross-pitch">Stop Guessing Your 1099-K.</p>
                <p className="text-muted-foreground">
                  Uber and Lyft report your "Gross Fares" to the IRS, but only pay you the "Net." If these don't match on your tax return, you risk an audit.
                </p>
              </div>
            </div>

            <ul className="space-y-2 text-sm">
              <li className="flex items-start gap-2">
                <Zap className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <span><strong>Automatically Gross-Up:</strong> We do the math to ensure your records match your 1099-K perfectly.</span>
              </li>
              <li className="flex items-start gap-2">
                <Zap className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <span><strong>Auto-Deduct Fees:</strong> Instantly categorize platform commissions to maximize your deductions.</span>
              </li>
              <li className="flex items-start gap-2">
                <Zap className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <span><strong>7-Year Vault:</strong> Secure storage that lasts as long as the IRS statute of limitations.</span>
              </li>
            </ul>

            <div className="flex flex-col gap-2 pt-2">
              <Button
                data-testid="button-upgrade-to-pro"
                onClick={() => checkoutMutation.mutate()}
                disabled={checkoutMutation.isPending}
              >
                {checkoutMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Crown className="mr-2 h-4 w-4" />
                )}
                Upgrade to Pro for Automatic 1099-K Matching
              </Button>
              <Link href="/upgrade">
                <Button variant="ghost" className="w-full" data-testid="button-learn-more-pro">
                  Learn More
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" data-testid="button-auto-import-pro">
          <Zap className="mr-2 h-4 w-4" />
          Smart Sales Importer
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Smart Sales Importer
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-start gap-2 p-3 rounded-md bg-blue-50/50 dark:bg-blue-950/30 border border-blue-200/40 dark:border-blue-800/30">
          <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
          <p className="text-xs text-blue-800/80 dark:text-blue-300/70 leading-relaxed" data-testid="text-auto-gross-help">
            Enter your net payout (what hit your bank). We'll calculate the gross amount that matches your 1099-K and automatically create the fee deduction.
          </p>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-2">
            <FormField
              control={form.control}
              name="netPayout"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Net Payout (Bank Deposit)</FormLabel>
                  <FormDescription className="text-xs">
                    The amount that actually hit your bank account
                  </FormDescription>
                  <FormControl>
                    <Input
                      data-testid="input-auto-gross-net"
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

            <FormField
              control={form.control}
              name="commissionRate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Platform Commission Rate</FormLabel>
                  <Select
                    onValueChange={(v) => field.onChange(Number(v))}
                    defaultValue={String(field.value)}
                  >
                    <FormControl>
                      <SelectTrigger data-testid="select-commission-rate">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="0.20">20% (Lyft typical)</SelectItem>
                      <SelectItem value="0.25">25% (Uber typical)</SelectItem>
                      <SelectItem value="0.30">30% (High commission)</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="py-3 px-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-muted-foreground">Calculated Gross (1099-K)</span>
                  <span className="text-lg font-bold font-display tracking-tight text-primary" data-testid="text-calculated-gross">
                    ${calculatedGross.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-muted-foreground">Platform Fee Deduction</span>
                  <span className="text-sm font-medium" data-testid="text-calculated-fee">
                    -${calculatedFee.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground pt-1 border-t border-border/40">
                  This matches Gross ÷ (1 - {(Number(commissionRate) * 100).toFixed(0)}%) = ${calculatedGross.toFixed(2)}
                </p>
              </CardContent>
            </Card>

            <FormField
              control={form.control}
              name="source"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Platform</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-auto-gross-source">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {sources.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
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
                    <Input data-testid="input-auto-gross-date" type="date" {...field} />
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
                  <FormLabel>Notes (Optional)</FormLabel>
                  <FormControl>
                    <Input data-testid="input-auto-gross-description" placeholder="e.g., Weekly Uber payout" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button data-testid="button-submit-auto-gross" type="submit" className="w-full" disabled={autoGrossMutation.isPending}>
              {autoGrossMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Import & Gross-Up
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
