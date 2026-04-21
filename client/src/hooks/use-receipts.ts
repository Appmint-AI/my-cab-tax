import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import type { Receipt } from "@shared/schema";

export type ReceiptWithSignedUrl = Receipt & { signedImageUrl?: string | null };

export interface ScanReceiptResponse {
  receipt: ReceiptWithSignedUrl;
  ocr: {
    merchantName: string;
    date: string;
    totalAmount: number | null;
    confidence: number;
    rawText: string;
    items: Array<{ description: string; amount: number }>;
  };
}

export function useReceipts() {
  return useQuery<ReceiptWithSignedUrl[]>({
    queryKey: ["/api/receipts"],
  });
}

export function useUploadReceipt() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (formData: FormData) => {
      const res = await fetch("/api/receipts/upload", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Upload failed");
      }
      return res.json() as Promise<ReceiptWithSignedUrl>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/receipts"] });
      toast({ title: "Receipt uploaded", description: "Your receipt has been saved to the vault." });
    },
    onError: (error) => {
      toast({ title: "Upload Error", description: error.message, variant: "destructive" });
    },
  });
}

export function useScanReceipt() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (formData: FormData) => {
      const res = await fetch("/api/scan-receipt", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Scan failed");
      }
      return res.json() as Promise<ScanReceiptResponse>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/receipts"] });
    },
    onError: (error) => {
      toast({ title: "Scan Error", description: error.message, variant: "destructive" });
    },
  });
}

export function useDeleteReceipt() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/receipts/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Delete failed");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/receipts"] });
      toast({ title: "Receipt deleted" });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}
