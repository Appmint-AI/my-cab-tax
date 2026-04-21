import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { type InsertMileageLog, type UpdateMileageLogRequest } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

export function useMileageLogs() {
  return useQuery({
    queryKey: [api.mileageLogs.list.path],
    queryFn: async () => {
      const res = await fetch(api.mileageLogs.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch mileage logs");
      return api.mileageLogs.list.responses[200].parse(await res.json());
    },
  });
}

export function useCreateMileageLog() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: InsertMileageLog) => {
      const res = await fetch(api.mileageLogs.create.path, {
        method: api.mileageLogs.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to create mileage log");
      }
      return api.mileageLogs.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.mileageLogs.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.tax.summary.path] });
      toast({
        title: "Mileage logged",
        description: "Your mileage entry has been recorded.",
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

export function useUpdateMileageLog() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...data }: { id: number } & UpdateMileageLogRequest) => {
      const url = buildUrl(api.mileageLogs.update.path, { id });
      const res = await fetch(url, {
        method: api.mileageLogs.update.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to update mileage log");
      }
      return api.mileageLogs.update.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.mileageLogs.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.tax.summary.path] });
      toast({
        title: "Mileage updated",
        description: "Your mileage entry has been updated.",
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

export function useDeleteMileageLog() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.mileageLogs.delete.path, { id });
      const res = await fetch(url, {
        method: api.mileageLogs.delete.method,
        credentials: "include",
      });

      if (!res.ok) {
        throw new Error("Failed to delete mileage log");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.mileageLogs.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.tax.summary.path] });
      toast({
        title: "Mileage deleted",
        description: "Your mileage entry has been removed.",
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
