import { useState } from "react";
import { Layout } from "@/components/Layout";
import { useVehicles, useCreateVehicle, useUpdateVehicle, useDeleteVehicle } from "@/hooks/use-vehicles";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
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
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertVehicleSchema, type Vehicle } from "@shared/schema";
import { z } from "zod";
import { Plus, Loader2, Trash2, Pencil, Car, Gauge, Wrench } from "lucide-react";

const formSchema = insertVehicleSchema.extend({
  name: z.string().min(1, "Vehicle name is required"),
  year: z.coerce.number().min(1900, "Year must be 1900 or later").max(new Date().getFullYear() + 2, "Year cannot be more than 2 years in the future").optional().nullable(),
});

type FormValues = z.infer<typeof formSchema>;

export default function VehiclesPage() {
  const { data: vehicles, isLoading } = useVehicles();
  const [formOpen, setFormOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);

  return (
    <Layout>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold" data-testid="text-vehicles-title">Vehicles</h1>
          <p className="text-muted-foreground">Manage your vehicles and mileage deduction methods.</p>
        </div>
        <VehicleFormDialog open={formOpen} onOpenChange={setFormOpen} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <Card className="border-border/60 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Vehicles</CardTitle>
            <div className="p-2 rounded-full bg-blue-100 dark:bg-blue-900/30">
              <Car className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-display" data-testid="text-vehicle-count">
              {vehicles?.length || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">registered vehicles</p>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Mileage Methods</CardTitle>
            <div className="p-2 rounded-full bg-purple-100 dark:bg-purple-900/30">
              <Gauge className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3 flex-wrap">
              <div>
                <span className="text-2xl font-bold font-display" data-testid="text-standard-count">
                  {vehicles?.filter(v => v.mileageMethod === "standard").length || 0}
                </span>
                <span className="text-xs text-muted-foreground ml-1">Standard</span>
              </div>
              <div>
                <span className="text-2xl font-bold font-display" data-testid="text-actual-count">
                  {vehicles?.filter(v => v.mileageMethod === "actual").length || 0}
                </span>
                <span className="text-xs text-muted-foreground ml-1">Actual</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Car className="h-5 w-5" />
            Your Vehicles
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 rounded-lg" />)}
            </div>
          ) : !vehicles || vehicles.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Car className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No vehicles added yet</p>
              <p className="text-sm mt-1">Add your first vehicle to start tracking expenses and mileage per car.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {vehicles.map((vehicle: Vehicle) => (
                <VehicleCard
                  key={vehicle.id}
                  vehicle={vehicle}
                  onEdit={() => setEditingVehicle(vehicle)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-sm mt-4">
        <CardContent className="py-4">
          <p className="text-xs text-muted-foreground leading-relaxed" data-testid="text-vehicle-irs-notice">
            IRS rules prevent "double dipping": vehicles using the Standard Mileage Rate cannot also deduct actual vehicle expenses (gas, repairs, insurance, depreciation) as "Car and Truck Expenses" on Schedule C. Vehicles set to "Actual Expenses" method can deduct real costs but cannot claim the per-mile rate. Choose your method carefully - the IRS generally requires you to use the same method for the life of the vehicle.
          </p>
        </CardContent>
      </Card>

      {editingVehicle && (
        <VehicleFormDialog
          open={true}
          onOpenChange={(open) => { if (!open) setEditingVehicle(null); }}
          initialData={editingVehicle}
        />
      )}
    </Layout>
  );
}

function VehicleCard({ vehicle, onEdit }: { vehicle: Vehicle; onEdit: () => void }) {
  const deleteMutation = useDeleteVehicle();

  const displayName = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ");

  return (
    <div className="flex items-center gap-3 p-4 rounded-lg border border-border/60 bg-background" data-testid={`card-vehicle-${vehicle.id}`}>
      <div className="p-2.5 rounded-lg bg-muted">
        <Car className="h-5 w-5 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium" data-testid={`text-vehicle-name-${vehicle.id}`}>{vehicle.name}</span>
          <Badge
            variant={vehicle.mileageMethod === "standard" ? "default" : "secondary"}
            className="text-xs no-default-active-elevate"
            data-testid={`badge-method-${vehicle.id}`}
          >
            {vehicle.mileageMethod === "standard" ? "Standard Mileage" : "Actual Expenses"}
          </Badge>
        </div>
        {displayName && (
          <p className="text-sm text-muted-foreground mt-0.5" data-testid={`text-vehicle-details-${vehicle.id}`}>
            {displayName}
          </p>
        )}
      </div>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" onClick={onEdit} data-testid={`button-edit-vehicle-${vehicle.id}`}>
          <Pencil className="h-4 w-4 text-muted-foreground" />
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="icon" data-testid={`button-delete-vehicle-${vehicle.id}`}>
              <Trash2 className="h-4 w-4 text-muted-foreground" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Vehicle</AlertDialogTitle>
              <AlertDialogDescription>
                This will remove "{vehicle.name}" from your vehicles. Expenses and mileage logs linked to this vehicle will become unassigned (they will not be deleted).
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteMutation.mutate(vehicle.id)}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

function VehicleFormDialog({ open, onOpenChange, initialData }: { open: boolean; onOpenChange: (open: boolean) => void; initialData?: Vehicle }) {
  const createMutation = useCreateVehicle();
  const updateMutation = useUpdateVehicle();
  const isPending = createMutation.isPending || updateMutation.isPending;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: initialData?.name ?? "",
      year: initialData?.year ?? (null as any),
      make: initialData?.make ?? "",
      model: initialData?.model ?? "",
      mileageMethod: (initialData?.mileageMethod ?? "standard") as "standard" | "actual",
    },
  });

  const onSubmit = (values: FormValues) => {
    if (initialData) {
      updateMutation.mutate(
        { id: initialData.id, ...values },
        { onSuccess: () => onOpenChange(false) }
      );
    } else {
      createMutation.mutate(values, {
        onSuccess: () => {
          onOpenChange(false);
          form.reset();
        },
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {!initialData && (
        <DialogTrigger asChild>
          <Button data-testid="button-add-vehicle">
            <Plus className="mr-2 h-5 w-5" />
            Add Vehicle
          </Button>
        </DialogTrigger>
      )}

      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{initialData ? "Edit Vehicle" : "Add New Vehicle"}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Vehicle Name</FormLabel>
                  <FormControl>
                    <Input data-testid="input-vehicle-name" placeholder="e.g. My Camry" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-3 gap-3">
              <FormField
                control={form.control}
                name="year"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Year</FormLabel>
                    <FormControl>
                      <Input
                        data-testid="input-vehicle-year"
                        type="number"
                        placeholder="2024"
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
                name="make"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Make</FormLabel>
                    <FormControl>
                      <Input data-testid="input-vehicle-make" placeholder="Toyota" {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="model"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Model</FormLabel>
                    <FormControl>
                      <Input data-testid="input-vehicle-model" placeholder="Camry" {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="mileageMethod"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Mileage Deduction Method</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-mileage-method">
                        <SelectValue placeholder="Select method" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="standard">Standard Mileage Rate ($0.725/mi)</SelectItem>
                      <SelectItem value="actual">Actual Expenses</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription className="text-xs">
                    Standard: deduct per mile. Actual: deduct real car costs. Cannot use both on the same vehicle.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button data-testid="button-submit-vehicle" type="submit" className="w-full" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {initialData ? "Save Changes" : "Add Vehicle"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
