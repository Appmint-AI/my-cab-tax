import { useState, useRef, useCallback, useEffect } from "react";
import Webcam from "react-webcam";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useScanReceipt, useUploadReceipt } from "@/hooks/use-receipts";
import { useSubscription, useCreateCheckoutSession } from "@/hooks/use-subscription";
import { useLocation } from "wouter";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import {
  Camera,
  Upload,
  X,
  RotateCcw,
  Check,
  Loader2,
  Lock,
  Crown,
  ArrowLeft,
  Zap,
  ScanLine,
  FlipHorizontal,
  ShieldCheck,
  DollarSign,
} from "lucide-react";

const IRS_CATEGORIES = [
  "Car and Truck Expenses",
  "Commissions and Fees",
  "Insurance",
  "Interest",
  "Legal and Professional Services",
  "Office Expense",
  "Other Expenses",
];

type ScanStep = "capture" | "processing" | "review" | "done";

export default function ScanPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { data: subscription } = useSubscription();
  const checkoutMutation = useCreateCheckoutSession();
  const scanMutation = useScanReceipt();
  const uploadMutation = useUploadReceipt();
  const isPro = subscription?.tier === "pro";

  const [step, setStep] = useState<ScanStep>("capture");
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [capturedFile, setCapturedFile] = useState<File | null>(null);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("environment");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const webcamRef = useRef<Webcam>(null);

  const [merchantName, setMerchantName] = useState("");
  const [receiptDate, setReceiptDate] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [category, setCategory] = useState("Other Expenses");
  const [ocrConfidence, setOcrConfidence] = useState(0);
  const [receiptId, setReceiptId] = useState<number | null>(null);
  const [subcategory, setSubcategory] = useState("");
  const [taxDeductible, setTaxDeductible] = useState(false);
  const [deductibilityReason, setDeductibilityReason] = useState("");

  const videoConstraints = {
    facingMode,
    width: { ideal: 1920 },
    height: { ideal: 1080 },
  };

  const capturePhoto = useCallback(() => {
    if (!webcamRef.current) return;
    const imageSrc = webcamRef.current.getScreenshot();
    if (!imageSrc) return;

    fetch(imageSrc)
      .then((res) => res.blob())
      .then((blob) => {
        const file = new File([blob], `receipt-${Date.now()}.jpg`, { type: "image/jpeg" });
        setCapturedImage(imageSrc);
        setCapturedFile(file);
      });
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size < 50 * 1024) {
      toast({
        title: "Image too small",
        description: "Minimum 50KB required for IRS-quality receipt images.",
        variant: "destructive",
      });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "Image too large",
        description: "Maximum 10MB allowed.",
        variant: "destructive",
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setCapturedImage(reader.result as string);
      setCapturedFile(file);
    };
    reader.readAsDataURL(file);
  };

  const retake = () => {
    setCapturedImage(null);
    setCapturedFile(null);
    setStep("capture");
    setMerchantName("");
    setReceiptDate("");
    setTotalAmount("");
    setCategory("Other Expenses");
    setOcrConfidence(0);
    setReceiptId(null);
    setSubcategory("");
    setTaxDeductible(false);
    setDeductibilityReason("");
  };

  const processReceipt = async () => {
    if (!capturedFile) return;
    setStep("processing");

    const formData = new FormData();
    formData.append("receipt", capturedFile);

    scanMutation.mutate(formData, {
      onSuccess: (data) => {
        setMerchantName(data.ocr.merchantName || "");
        setReceiptDate(data.ocr.date || "");
        setTotalAmount(data.ocr.totalAmount != null ? String(data.ocr.totalAmount) : "");
        setCategory(data.ocr.scheduleCCategory || data.ocr.category || "Other Expenses");
        setOcrConfidence(data.ocr.confidence);
        setReceiptId(data.receipt.id);
        setSubcategory(data.ocr.subcategory || "");
        setTaxDeductible(data.ocr.taxDeductible ?? false);
        setDeductibilityReason(data.ocr.deductibilityReason || "");
        setStep("review");
      },
      onError: () => {
        setStep("capture");
      },
    });
  };

  const uploadOnly = async () => {
    if (!capturedFile) return;
    setStep("processing");

    const formData = new FormData();
    formData.append("receipt", capturedFile);

    uploadMutation.mutate(formData, {
      onSuccess: () => {
        toast({
          title: "Receipt saved",
          description: "Your receipt has been uploaded to the vault.",
        });
        setStep("done");
      },
      onError: () => {
        setStep("capture");
      },
    });
  };

  const createExpense = async () => {
    if (!totalAmount || !merchantName) {
      toast({
        title: "Missing fields",
        description: "Please fill in at least the merchant name and total amount.",
        variant: "destructive",
      });
      return;
    }

    try {
      const res = await apiRequest("POST", "/api/expenses", {
        amount: Number(totalAmount),
        category,
        description: `Receipt from ${merchantName}`,
        date: receiptDate || new Date().toISOString().split("T")[0],
      });

      const expense = await res.json();

      if (receiptId && expense?.id) {
        try {
          await apiRequest("PATCH", `/api/receipts/${receiptId}`, {
            expenseId: expense.id,
          });
        } catch {}
      }

      queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/receipts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tax-summary"] });

      toast({
        title: "Expense created",
        description: `$${Number(totalAmount).toFixed(2)} expense from ${merchantName} added to your records.`,
      });
      setStep("done");
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  if (step === "done") {
    const savedAmount = totalAmount ? Number(totalAmount) : 0;
    const estimatedSETax = savedAmount * 0.153;

    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="py-8 flex flex-col items-center text-center gap-5">
            <div className="h-16 w-16 rounded-full bg-green-500/10 flex items-center justify-center">
              <ShieldCheck className="h-8 w-8 text-green-600 dark:text-green-400" />
            </div>

            <div>
              <h2 className="text-2xl font-bold" data-testid="text-deduction-locked">
                Deduction Locked!
              </h2>
              {merchantName && (
                <p className="text-sm text-muted-foreground mt-1" data-testid="text-merchant-saved">
                  {merchantName}
                </p>
              )}
            </div>

            {savedAmount > 0 && (
              <Card className="w-full bg-green-500/5 border-green-500/20">
                <CardContent className="py-4 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-green-500/10 flex items-center justify-center shrink-0">
                    <DollarSign className="h-5 w-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div className="text-left">
                    <p className="text-xs text-muted-foreground">Estimated Self-Employment Tax Saved</p>
                    <p className="text-lg font-bold text-green-600 dark:text-green-400" data-testid="text-tax-saved">
                      ${estimatedSETax.toFixed(2)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      15.3% SE tax on ${savedAmount.toFixed(2)} deduction
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {isPro && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="text-vault-status">
                <ShieldCheck className="h-4 w-4 text-primary" />
                <span>Secured in your 7-year IRS Vault</span>
              </div>
            )}

            {!isPro && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="text-vault-status-basic">
                <ShieldCheck className="h-4 w-4" />
                <span>Receipt saved (90-day retention)</span>
              </div>
            )}

            <div className="flex gap-3 flex-wrap justify-center w-full pt-2">
              <Button onClick={retake} className="flex-1 min-w-[140px]" data-testid="button-scan-another">
                <ScanLine className="mr-2 h-4 w-4" />
                Scan Another
              </Button>
              <Button variant="outline" onClick={() => setLocation("/receipts")} className="flex-1 min-w-[140px]" data-testid="button-view-receipts">
                View Receipts
              </Button>
            </div>
            <Button variant="ghost" onClick={() => setLocation("/dashboard")} className="w-full" data-testid="button-go-dashboard">
              Back to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (step === "processing") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="py-12 flex flex-col items-center text-center gap-4">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <div>
              <h2 className="text-lg font-semibold" data-testid="text-scan-processing">
                {isPro ? "AI is reading your receipt..." : "Uploading receipt..."}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                {isPro
                  ? "Extracting merchant, date, and total using AI vision."
                  : "Saving your receipt image to the vault."}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (step === "review") {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="max-w-lg mx-auto space-y-4">
          <div className="flex items-center gap-3">
            <Button size="icon" variant="ghost" onClick={retake} data-testid="button-back-capture">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-xl font-semibold" data-testid="text-review-title">Review & Create Expense</h1>
              <p className="text-sm text-muted-foreground">
                AI scanned your receipt. Verify the details below.
              </p>
            </div>
          </div>

          {capturedImage && (
            <div className="rounded-md overflow-hidden border max-h-48">
              <img
                src={capturedImage}
                alt="Scanned receipt"
                className="w-full h-full object-contain bg-muted/30"
                data-testid="img-scanned-receipt"
              />
            </div>
          )}

          <Card>
            <CardContent className="py-4 space-y-3">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium" data-testid="text-ai-results">AI Scan Results</span>
                <Badge variant="outline" className="ml-auto text-xs">
                  {ocrConfidence}% confidence
                </Badge>
              </div>

              <div className="space-y-3">
                <div>
                  <Label htmlFor="merchantName" className="text-xs text-muted-foreground">Merchant Name</Label>
                  <Input
                    id="merchantName"
                    value={merchantName}
                    onChange={(e) => setMerchantName(e.target.value)}
                    placeholder="Store name"
                    data-testid="input-review-merchant"
                  />
                </div>
                <div>
                  <Label htmlFor="receiptDate" className="text-xs text-muted-foreground">Date</Label>
                  <Input
                    id="receiptDate"
                    type="date"
                    value={receiptDate}
                    onChange={(e) => setReceiptDate(e.target.value)}
                    data-testid="input-review-date"
                  />
                </div>
                <div>
                  <Label htmlFor="totalAmount" className="text-xs text-muted-foreground">Total Amount ($)</Label>
                  <Input
                    id="totalAmount"
                    type="number"
                    step="0.01"
                    value={totalAmount}
                    onChange={(e) => setTotalAmount(e.target.value)}
                    placeholder="0.00"
                    data-testid="input-review-total"
                  />
                </div>
                <div>
                  <Label htmlFor="category" className="text-xs text-muted-foreground">IRS Schedule C Category</Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger data-testid="select-review-category">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {IRS_CATEGORIES.map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {cat}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {subcategory && (
                  <div className="rounded-md bg-muted/50 p-2.5 space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <ScanLine className="h-3.5 w-3.5 text-primary" />
                      <span className="text-xs font-medium" data-testid="text-subcategory">AI Classification: {subcategory}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {taxDeductible ? (
                        <Badge variant="default" className="text-[10px] px-1.5 py-0 bg-green-600" data-testid="badge-deductible">
                          <ShieldCheck className="h-3 w-3 mr-0.5" /> Tax Deductible
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0" data-testid="badge-not-deductible">
                          Not Deductible
                        </Badge>
                      )}
                    </div>
                    {deductibilityReason && (
                      <p className="text-[11px] text-muted-foreground leading-snug" data-testid="text-deductibility-reason">
                        {deductibilityReason}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-3">
            <Button onClick={createExpense} className="flex-1" data-testid="button-create-expense">
              <Check className="mr-2 h-4 w-4" />
              Create Expense
            </Button>
            <Button variant="outline" onClick={() => { setStep("done"); }} data-testid="button-skip-expense">
              Skip
            </Button>
          </div>
          <Button variant="ghost" onClick={retake} className="w-full" data-testid="button-retake-scan">
            <RotateCcw className="mr-2 h-4 w-4" />
            Retake Photo
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex flex-col">
      <div className="flex items-center justify-between p-3 bg-black/80 z-10">
        <Button size="icon" variant="ghost" onClick={() => setLocation("/receipts")} className="text-white" data-testid="button-close-scan">
          <X className="h-5 w-5" />
        </Button>
        <h1 className="text-white text-sm font-medium" data-testid="text-scan-title">
          {isPro ? "AI Receipt Scanner" : "Receipt Camera"}
        </h1>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => setFacingMode((p) => (p === "user" ? "environment" : "user"))}
          className="text-white"
          data-testid="button-flip-camera"
        >
          <FlipHorizontal className="h-5 w-5" />
        </Button>
      </div>

      <div className="flex-1 relative flex items-center justify-center">
        {!capturedImage ? (
          <>
            <Webcam
              ref={webcamRef}
              audio={false}
              screenshotFormat="image/jpeg"
              screenshotQuality={0.92}
              videoConstraints={videoConstraints}
              className="w-full h-full object-cover"
              data-testid="video-webcam-feed"
              mirrored={facingMode === "user"}
            />
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="w-[85%] h-[70%] max-w-md max-h-[600px] relative">
                <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-white/70 rounded-tl-lg" />
                <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-white/70 rounded-tr-lg" />
                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-white/70 rounded-bl-lg" />
                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-white/70 rounded-br-lg" />

                <div className="absolute top-1/2 left-0 right-0 h-[1px] bg-white/20" />

                <div className="absolute bottom-4 left-0 right-0 text-center">
                  <p className="text-white/60 text-xs">
                    Align receipt within the frame
                  </p>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-black">
            <img
              src={capturedImage}
              alt="Captured receipt"
              className="max-w-full max-h-full object-contain"
              data-testid="img-captured-preview"
            />
          </div>
        )}
      </div>

      <div className="bg-black/80 p-4 pb-8 space-y-3">
        {!capturedImage ? (
          <div className="flex items-center justify-center gap-6">
            <Button
              size="icon"
              variant="ghost"
              onClick={() => fileInputRef.current?.click()}
              className="text-white h-12 w-12"
              data-testid="button-upload-file"
            >
              <Upload className="h-6 w-6" />
            </Button>

            <button
              onClick={capturePhoto}
              className="h-16 w-16 rounded-full bg-white flex items-center justify-center active:scale-95 transition-transform"
              data-testid="button-shutter"
            >
              <div className="h-14 w-14 rounded-full border-2 border-black/20" />
            </button>

            <div className="h-12 w-12" />
          </div>
        ) : (
          <div className="flex gap-3">
            <Button variant="outline" onClick={retake} className="flex-1 text-white border-white/30" data-testid="button-retake">
              <RotateCcw className="mr-2 h-4 w-4" />
              Retake
            </Button>
            {isPro ? (
              <Button onClick={processReceipt} className="flex-1" data-testid="button-scan-ai">
                <Zap className="mr-2 h-4 w-4" />
                Scan with AI
              </Button>
            ) : (
              <Button onClick={uploadOnly} className="flex-1" data-testid="button-upload-save">
                <Check className="mr-2 h-4 w-4" />
                Save Receipt
              </Button>
            )}
          </div>
        )}

        {!isPro && !capturedImage && (
          <div className="flex items-center justify-center gap-2 text-white/60 text-xs">
            <Lock className="h-3 w-3" />
            <span>AI scanning requires Pro.</span>
            <button
              onClick={() => checkoutMutation.mutate()}
              className="text-primary underline"
              data-testid="button-upgrade-scan"
            >
              Upgrade
            </button>
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFileUpload}
        data-testid="input-scan-file"
      />
    </div>
  );
}
