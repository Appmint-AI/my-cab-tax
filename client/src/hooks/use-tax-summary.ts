import { useQuery } from "@tanstack/react-query";
import { api } from "@shared/routes";

export function useTaxSummary() {
  return useQuery({
    queryKey: [api.tax.summary.path],
    queryFn: async () => {
      const res = await fetch(api.tax.summary.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch tax summary");
      return api.tax.summary.responses[200].parse(await res.json());
    },
  });
}
