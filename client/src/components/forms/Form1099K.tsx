import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertIncomeSchema } from "@shared/schema";
import { useCreateIncome } from "@/hooks/use-incomes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { useState } from "react";
import { FileText, Loader2, Info } from "lucide-react";
import { z } from "zod";

const form1099KSchema = insertIncomeSchema.extend({
  amount: z.coerce.number().positive("Gross amount must be positive"),
  date: z.string().min(1, "Date is required"),
  platformFees: z.coerce.number().min(0).optional().default(0),
  miles: z.coerce.number().min(0).optional().default(0),
});

export function Form1099K() {
  const [open, setOpen] = useState(false);
  const createMutation = useCreateIncome();

  const form = useForm<z.infer<typeof form1099KSchema>>({
    resolver: zodResolver(form1099KSchema),
    defaultValues: {
      amount: "" as any,
      source: "1099-K",
      date: new Date().toISOString().split("T")[0],
      description: "",
      platformFees: 0,
      miles: 0,
    },
  });

  const grossAmount = form.watch("amount") || 0;
  const fees = form.watch("platformFees") || 0;
  const estimatedNet = Math.max(0, Number(grossAmount) - Number(fees));

  const onSubmit = (values: z.infer<typeof form1099KSchema>) => {
    createMutation.mutate(
      { ...values, source: values.source || "1099-K" },
      {
        onSuccess: () => {
          setOpen(false);
          form.reset();
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" data-testid="button-add-1099k">
          <FileText className="mr-2 h-5 w-5" />
          Add 1099-K
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            1099-K Entry
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-start gap-2 p-3 rounded-md bg-blue-50/50 dark:bg-blue-950/30 border border-blue-200/40 dark:border-blue-800/30">
          <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
          <p className="text-xs text-blue-800/80 dark:text-blue-300/70 leading-relaxed" data-testid="text-1099k-help">
            Enter the GROSS amount from Box 1a of your 1099-K, even if it differs from your bank deposits. The IRS expects to see this gross figure on Schedule C, Line 1. Platform fees are deducted separately on Line 10.
          </p>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-2">
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Gross Amount of Payment (Box 1a)</FormLabel>
                  <FormDescription className="text-xs">
                    Maps to Schedule C, Line 1 (Gross Receipts)
                  </FormDescription>
                  <FormControl>
                    <Input
                      data-testid="input-1099k-gross"
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
              name="platformFees"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Platform Fees / Commissions</FormLabel>
                  <FormDescription className="text-xs">
                    Maps to Schedule C, Line 10 (Commissions and Fees)
                  </FormDescription>
                  <FormControl>
                    <Input
                      data-testid="input-1099k-fees"
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

            <Card className="border-border/60">
              <CardContent className="py-3 px-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-muted-foreground">Estimated Net</span>
                  <span className="text-lg font-bold font-display tracking-tight" data-testid="text-1099k-estimated-net">
                    ${estimatedNet.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Cross-reference this with your actual bank deposits to verify accuracy.
                </p>
              </CardContent>
            </Card>

            <FormField
              control={form.control}
              name="source"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Platform Source</FormLabel>
                  <FormControl>
                    <Input
                      data-testid="input-1099k-source"
                      placeholder="e.g., Uber, Lyft"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tax Year End Date</FormLabel>
                  <FormControl>
                    <Input data-testid="input-1099k-date" type="date" {...field} />
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
                    <Input data-testid="input-1099k-description" placeholder="e.g., 2026 Uber 1099-K" {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button data-testid="button-submit-1099k" type="submit" className="w-full" disabled={createMutation.isPending}>
              {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save 1099-K Entry
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
