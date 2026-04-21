import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useUploadReceipt, useScanReceipt } from "@/hooks/use-receipts";
import { useSubscription, useCreateCheckoutSession } from "@/hooks/use-subscription";
import { useLocation } from "wouter";
import { Loader2, Camera, Upload, ScanLine, Lock, Crown, AlertTriangle, Check } from "lucide-react";

interface OcrResult {
  merchantName: string;
  date: string;
  totalAmount: number | null;
  confidence: number;
  rawText: string;
}

interface ReceiptCaptureProps {
  onOcrResult?: (result: OcrResult) => void;
  trigger?: React.ReactNode;
}

const MIN_FILE_SIZE = 50 * 1024;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MIN_DIMENSION = 400;

function checkImageQuality(file: File): Promise<{ valid: boolean; reason?: string }> {
  return new Promise((resolve) => {
    if (file.size < MIN_FILE_SIZE) {
      resolve({ valid: false, reason: "Image file is too small. Please use a higher quality photo for IRS standards." });
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      resolve({ valid: false, reason: "Image file is too large (max 10MB). Please resize the photo." });
      return;
    }

    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      if (img.width < MIN_DIMENSION || img.height < MIN_DIMENSION) {
        resolve({
          valid: false,
          reason: `Image too blurry for IRS standards. Minimum resolution is ${MIN_DIMENSION}x${MIN_DIMENSION}px. Please retake the photo in better light to ensure your deduction is valid.`,
        });
      } else {
        resolve({ valid: true });
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ valid: false, reason: "Could not read the image file. Please try a different photo." });
    };
    img.src = url;
  });
}

export function ReceiptCapture({ onOcrResult, trigger }: ReceiptCaptureProps) {
  const [open, setOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [qualityError, setQualityError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [ocrResult, setOcrResult] = useState<OcrResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [, setLocation] = useLocation();

  const { data: subscription } = useSubscription();
  const checkoutMutation = useCreateCheckoutSession();
  const uploadMutation = useUploadReceipt();
  const scanMutation = useScanReceipt();
  const isPro = subscription?.tier === "pro";

  const handleFileSelected = async (file: File) => {
    setQualityError(null);
    setOcrResult(null);

    const quality = await checkImageQuality(file);
    if (!quality.valid) {
      setQualityError(quality.reason || "Image quality check failed");
      return;
    }

    setSelectedFile(file);
    const url = URL.createObjectURL(file);
    setPreview(url);

    if (isPro) {
      await runAiOcr(file);
    }
  };

  const runAiOcr = async (file: File) => {
    setIsProcessing(true);
    try {
      const formData = new FormData();
      formData.append("receipt", file);

      const result = await scanMutation.mutateAsync(formData);

      const ocrData: OcrResult = {
        merchantName: result.ocr.merchantName,
        date: result.ocr.date,
        totalAmount: result.ocr.totalAmount,
        confidence: result.ocr.confidence,
        rawText: result.ocr.rawText,
      };
      setOcrResult(ocrData);
      if (onOcrResult) {
        onOcrResult(ocrData);
      }
    } catch (err) {
      console.error("AI OCR error:", err);
      setOcrResult({
        merchantName: "",
        date: "",
        totalAmount: null,
        confidence: 0,
        rawText: "AI scanning failed. You can enter the details manually.",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    if (ocrResult) {
      resetState();
      setOpen(false);
      return;
    }

    const formData = new FormData();
    formData.append("receipt", selectedFile);

    uploadMutation.mutate(formData, {
      onSuccess: () => {
        resetState();
        setOpen(false);
      },
    });
  };

  const resetState = () => {
    setSelectedFile(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setQualityError(null);
    setOcrResult(null);
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      resetState();
    }
    setOpen(newOpen);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogTrigger asChild>
          {trigger || (
            <Button variant="outline" data-testid="button-scan-receipt">
              <ScanLine className="mr-2 h-4 w-4" />
              Scan Receipt
            </Button>
          )}
        </DialogTrigger>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2" data-testid="text-receipt-title">
              <ScanLine className="h-5 w-5" />
              {isPro ? "AI Receipt Scanner" : "Upload Receipt"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {!selectedFile && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  {isPro ? (
                    <Button
                      variant="outline"
                      className="h-24 flex-col gap-2"
                      onClick={() => {
                        setOpen(false);
                        setLocation("/scan");
                      }}
                      data-testid="button-camera-capture"
                    >
                      <Camera className="h-6 w-6" />
                      <span className="text-xs">Live Scan</span>
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      className="h-24 flex-col gap-2 opacity-60"
                      onClick={() => checkoutMutation.mutate()}
                      disabled={checkoutMutation.isPending}
                      data-testid="button-camera-locked"
                    >
                      <div className="relative">
                        <Camera className="h-6 w-6" />
                        <Lock className="h-3 w-3 absolute -top-1 -right-1 text-muted-foreground" />
                      </div>
                      <span className="text-xs">Live Scan (Pro)</span>
                    </Button>
                  )}

                  <Button
                    variant="outline"
                    className="h-24 flex-col gap-2"
                    onClick={() => fileInputRef.current?.click()}
                    data-testid="button-file-upload"
                  >
                    <Upload className="h-6 w-6" />
                    <span className="text-xs">Upload Photo</span>
                  </Button>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileSelected(file);
                  }}
                  data-testid="input-receipt-file"
                />

                {!isPro && (
                  <Card className="border-primary/20 bg-primary/5">
                    <CardContent className="py-3 px-4">
                      <div className="flex items-start gap-2">
                        <Crown className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                        <div className="text-xs leading-relaxed">
                          <p className="font-medium mb-1" data-testid="text-scanner-upsell">Stop typing, start driving.</p>
                          <p className="text-muted-foreground">
                            Upgrade to Pro to unlock the AI Receipt Scanner. Just point your camera, and we'll handle the Merchant, Date, and Totals for you.
                          </p>
                          <Button
                            size="sm"
                            className="mt-2"
                            onClick={() => checkoutMutation.mutate()}
                            disabled={checkoutMutation.isPending}
                            data-testid="button-upgrade-scanner"
                          >
                            {checkoutMutation.isPending ? (
                              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                            ) : (
                              <Crown className="mr-1 h-3 w-3" />
                            )}
                            Upgrade to Pro
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {preview && selectedFile && (
              <div className="space-y-3">
                <div className="relative rounded-md overflow-hidden border">
                  <img src={preview} alt="Receipt preview" className="w-full max-h-64 object-contain bg-muted/30" data-testid="img-receipt-preview" />
                </div>

                {isProcessing && (
                  <Card className="border-primary/20 bg-primary/5">
                    <CardContent className="py-4 px-4 flex items-center justify-center gap-3">
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                      <span className="text-sm font-medium" data-testid="text-ocr-processing">AI is reading your receipt...</span>
                    </CardContent>
                  </Card>
                )}

                {ocrResult && !isProcessing && (
                  <Card className="border-green-500/20 bg-green-500/5 dark:bg-green-900/10">
                    <CardContent className="py-3 px-4 space-y-2">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
                        <span data-testid="text-ocr-complete">Scan Complete</span>
                        <span className="text-xs text-muted-foreground ml-auto">
                          {ocrResult.confidence}% confidence
                        </span>
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Label className="text-xs text-muted-foreground w-16 shrink-0">Merchant</Label>
                          <Input
                            value={ocrResult.merchantName}
                            onChange={(e) => setOcrResult({ ...ocrResult, merchantName: e.target.value })}
                            className="h-8 text-sm"
                            data-testid="input-ocr-merchant"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <Label className="text-xs text-muted-foreground w-16 shrink-0">Date</Label>
                          <Input
                            type="date"
                            value={ocrResult.date}
                            onChange={(e) => setOcrResult({ ...ocrResult, date: e.target.value })}
                            className="h-8 text-sm"
                            data-testid="input-ocr-date"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <Label className="text-xs text-muted-foreground w-16 shrink-0">Total</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={ocrResult.totalAmount ?? ""}
                            onChange={(e) => setOcrResult({ ...ocrResult, totalAmount: e.target.value ? Number(e.target.value) : null })}
                            className="h-8 text-sm"
                            data-testid="input-ocr-total"
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                <div className="flex gap-2">
                  <Button
                    onClick={handleUpload}
                    className="flex-1"
                    disabled={uploadMutation.isPending}
                    data-testid="button-save-receipt"
                  >
                    {uploadMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="mr-2 h-4 w-4" />
                    )}
                    {ocrResult ? "Done" : "Save Receipt"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={resetState}
                    data-testid="button-retake-receipt"
                  >
                    Retake
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!qualityError} onOpenChange={() => setQualityError(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Image Quality Warning
            </AlertDialogTitle>
            <AlertDialogDescription data-testid="text-quality-error">
              {qualityError}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setQualityError(null)} data-testid="button-dismiss-quality">
              Try Again
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
