import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertExpenseSchema, type InsertExpense } from "@shared/schema";
import { useCreateExpense, useUpdateExpense } from "@/hooks/use-expenses";
import { useVehicles } from "@/hooks/use-vehicles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Plus, Loader2, Info, Lightbulb } from "lucide-react";
import { z } from "zod";
import { SALT_DEDUCTION_CAP } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { getSegmentConfig } from "@/lib/segment-config";

const formSchema = insertExpenseSchema.extend({
  amount: z.coerce.number().positive("Amount must be positive"),
  date: z.string().min(1, "Date is required"),
});

interface ExpenseFormProps {
  initialData?: { id: number; amount: string | number; category: string; date: string; description?: string | null; receiptUrl?: string | null; vehicleId?: number | null };
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: React.ReactNode;
}

export function ExpenseForm({ initialData, open: controlledOpen, onOpenChange: setControlledOpen, trigger }: ExpenseFormProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = controlledOpen ?? internalOpen;
  const setOpen = setControlledOpen ?? setInternalOpen;

  const createMutation = useCreateExpense();
  const updateMutation = useUpdateExpense();
  const { data: vehicles } = useVehicles();
  const isPending = createMutation.isPending || updateMutation.isPending;

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      amount: initialData?.amount ? Number(initialData.amount) : ("" as any),
      category: initialData?.category ?? "Car and Truck Expenses",
      date: initialData?.date ? new Date(initialData.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      description: initialData?.description ?? "",
      receiptUrl: initialData?.receiptUrl ?? "",
      vehicleId: initialData?.vehicleId ?? null,
    },
  });

  useEffect(() => {
    if (initialData) {
      form.reset({
        amount: Number(initialData.amount),
        category: initialData.category,
        date: new Date(initialData.date).toISOString().split('T')[0],
        description: initialData.description ?? "",
        receiptUrl: initialData.receiptUrl ?? "",
        vehicleId: initialData.vehicleId ?? null,
      });
    }
  }, [initialData, form]);

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    if (initialData) {
      updateMutation.mutate(
        { id: initialData.id, ...values },
        { onSuccess: () => setOpen(false) }
      );
    } else {
      createMutation.mutate(values, {
        onSuccess: () => {
          setOpen(false);
          form.reset();
        },
      });
    }
  };

  const categories = [
    "Car and Truck Expenses",
    "Commissions and Fees",
    "Home Office",
    "Insurance",
    "Interest",
    "Legal and Professional Services",
    "Office Expense",
    "Property Tax (SALT)",
    "Other Expenses",
  ];

  const { user } = useAuth();
  const segmentConfig = getSegmentConfig(user?.userSegment);

  const selectedCategory = form.watch("category");
  const isSaltCategory = selectedCategory === "Property Tax (SALT)" || selectedCategory === "Home Office";

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      {!trigger && !initialData && (
        <DialogTrigger asChild>
          <Button variant="outline" data-testid="button-add-expense">
            <Plus className="mr-2 h-5 w-5" />
            Add Expense
          </Button>
        </DialogTrigger>
      )}
      
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{initialData ? "Edit Expense" : "Add New Expense"}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Amount ($)</FormLabel>
                  <FormControl>
                    <Input 
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
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a category" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {categories.map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {cat}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {isSaltCategory && (
              <div className="flex items-start gap-2 p-3 rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20" data-testid="info-salt-cap">
                <Info className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-medium text-amber-900 dark:text-amber-200">
                    2026 SALT Deduction Cap: ${SALT_DEDUCTION_CAP.toLocaleString()}
                  </p>
                  <p className="text-xs text-amber-800/70 dark:text-amber-300/70 mt-0.5">
                    {selectedCategory === "Home Office"
                      ? "Home office deductions may include a portion of property taxes. The combined SALT deduction is capped at $40,000 for 2026 (up from $10,000)."
                      : "State and local property taxes are subject to the $40,000 SALT cap for 2026 (increased from $10,000 under the TCJA extension)."}
                  </p>
                </div>
              </div>
            )}

            {segmentConfig.expenseSuggestions.length > 0 && !initialData && (
              <div className="flex items-start gap-2 p-3 rounded-md border bg-muted/30" data-testid="info-segment-expenses">
                <Lightbulb className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground">
                  Common {segmentConfig.label.toLowerCase()} expenses: {segmentConfig.expenseSuggestions.join(", ")}
                </p>
              </div>
            )}

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
                        <SelectTrigger data-testid="select-expense-vehicle">
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
              name="date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Date</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
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
                    <Input placeholder="Repair shop name, etc." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {initialData ? "Save Changes" : "Record Expense"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
