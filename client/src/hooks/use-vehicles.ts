import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { type InsertVehicle, type UpdateVehicleRequest, type Vehicle } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

export function useVehicles() {
  return useQuery<Vehicle[]>({
    queryKey: [api.vehicles.list.path],
    queryFn: async () => {
      const res = await fetch(api.vehicles.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch vehicles");
      return res.json();
    },
  });
}

export function useCreateVehicle() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: InsertVehicle) => {
      const res = await fetch(api.vehicles.create.path, {
        method: api.vehicles.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to create vehicle");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.vehicles.list.path] });
      toast({
        title: "Vehicle added",
        description: "Your vehicle has been added successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useUpdateVehicle() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...data }: { id: number } & UpdateVehicleRequest) => {
      const url = buildUrl(api.vehicles.update.path, { id });
      const res = await fetch(url, {
        method: api.vehicles.update.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to update vehicle");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.vehicles.list.path] });
      toast({
        title: "Vehicle updated",
        description: "Your vehicle has been updated successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useDeleteVehicle() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.vehicles.delete.path, { id });
      const res = await fetch(url, {
        method: api.vehicles.delete.method,
        credentials: "include",
      });

      if (!res.ok) {
        throw new Error("Failed to delete vehicle");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.vehicles.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.tax.summary.path] });
      toast({
        title: "Vehicle deleted",
        description: "Your vehicle has been removed. Associated records are now unassigned.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}
