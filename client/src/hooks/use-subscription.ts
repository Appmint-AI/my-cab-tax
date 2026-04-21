import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

interface SubscriptionStatus {
  tier: string;
  stripeCustomerId: string | null;
  dataRetentionUntil: string | null;
}

export function useSubscription() {
  return useQuery<SubscriptionStatus>({
    queryKey: ["/api/subscription/status"],
    queryFn: async () => {
      const res = await fetch("/api/subscription/status", { credentials: "include" });
      if (!res.ok) return { tier: "basic", stripeCustomerId: null, dataRetentionUntil: null };
      return res.json();
    },
    retry: false,
    staleTime: 1000 * 60 * 2,
  });
}

export function useCreateCheckoutSession() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to create checkout session");
      }
      return res.json();
    },
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
      }
    },
    onError: (error) => {
      toast({
        title: "Payment Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useAutoGross() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: {
      netPayout: number;
      source: string;
      date: string;
      description?: string;
      commissionRate?: number;
    }) => {
      const res = await fetch("/api/income/auto-gross", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Auto-grossing failed");
      }
      return res.json();
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
