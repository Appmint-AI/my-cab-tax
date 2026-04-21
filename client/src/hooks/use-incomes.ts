import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { type InsertIncome, type UpdateIncomeRequest } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

export function useIncomes() {
  return useQuery({
    queryKey: [api.incomes.list.path],
    queryFn: async () => {
      const res = await fetch(api.incomes.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch incomes");
      return api.incomes.list.responses[200].parse(await res.json());
    },
  });
}

export function useIncome(id: number) {
  return useQuery({
    queryKey: [api.incomes.get.path, id],
    queryFn: async () => {
      const url = buildUrl(api.incomes.get.path, { id });
      const res = await fetch(url, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch income");
      return api.incomes.get.responses[200].parse(await res.json());
    },
    enabled: !!id,
  });
}

export function useCreateIncome() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: InsertIncome) => {
      const res = await fetch(api.incomes.create.path, {
        method: api.incomes.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to create income");
      }
      return api.incomes.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.incomes.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.tax.summary.path] });
      toast({
        title: "Income added",
        description: "Your income has been successfully recorded.",
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

export function useUpdateIncome() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...data }: { id: number } & UpdateIncomeRequest) => {
      const url = buildUrl(api.incomes.update.path, { id });
      const res = await fetch(url, {
        method: api.incomes.update.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to update income");
      }
      return api.incomes.update.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.incomes.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.tax.summary.path] });
      toast({
        title: "Income updated",
        description: "Your income has been successfully updated.",
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

export function useDeleteIncome() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.incomes.delete.path, { id });
      const res = await fetch(url, {
        method: api.incomes.delete.method,
        credentials: "include",
      });

      if (!res.ok) {
        throw new Error("Failed to delete income");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.incomes.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.tax.summary.path] });
      toast({
        title: "Income deleted",
        description: "Your income has been removed.",
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
