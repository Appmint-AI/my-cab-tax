import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Lock, Shield, ExternalLink, Gift, Copy, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface SubmissionSuccessProps {
  taxYear: number;
  filingId?: string;
  submissionHash?: string;
  variant: "finalize" | "export";
  onClose?: () => void;
  onGoToExport?: () => void;
}

function VaultLockAnimation() {
  const [phase, setPhase] = useState<"locking" | "locked">("locking");

  useEffect(() => {
    const timer = setTimeout(() => setPhase("locked"), 1800);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="relative w-24 h-24 mx-auto" data-testid="animation-vault-lock">
      <motion.div
        className="absolute inset-0 rounded-full border-4 border-green-500/30"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      />

      <motion.div
        className="absolute inset-2 rounded-full border-2 border-green-500/20"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ duration: 0.6, delay: 0.2, ease: "easeOut" }}
      />

      <AnimatePresence mode="wait">
        {phase === "locking" ? (
          <motion.div
            key="locking"
            className="absolute inset-0 flex items-center justify-center"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8, rotate: -10 }}
            transition={{ duration: 0.4 }}
          >
            <Shield className="h-10 w-10 text-green-500" />
          </motion.div>
        ) : (
          <motion.div
            key="locked"
            className="absolute inset-0 flex items-center justify-center"
            initial={{ opacity: 0, scale: 1.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 15 }}
          >
            <Lock className="h-10 w-10 text-green-600 dark:text-green-400" />
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        className="absolute inset-0 rounded-full bg-green-500/10"
        initial={{ scale: 0 }}
        animate={{ scale: [0, 1.3, 1] }}
        transition={{ duration: 1, delay: 1.8, ease: "easeOut" }}
      />
    </div>
  );
}

const REFERRAL_CODE = "MCTUSA-FRIEND";

export function SubmissionSuccess({
  taxYear,
  filingId,
  submissionHash,
  variant,
  onClose,
  onGoToExport,
}: SubmissionSuccessProps) {
  const { toast } = useToast();
  const [showDetails, setShowDetails] = useState(false);

  const handleCopyReferral = () => {
    navigator.clipboard.writeText(REFERRAL_CODE).then(() => {
      toast({
        title: "Referral code copied",
        description: "Share it with a fellow driver to earn 1 free month of Premium.",
      });
    }).catch(() => {
      toast({
        title: "Referral code",
        description: REFERRAL_CODE,
      });
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="space-y-6"
      data-testid="submission-success"
    >
      <div className="text-center space-y-5 py-4">
        <VaultLockAnimation />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8, duration: 0.6 }}
          className="space-y-2"
        >
          <h2 className="text-2xl md:text-3xl font-display font-bold" data-testid="text-success-headline">
            Tax Season: Conquered!
          </h2>
          <Badge variant="outline" className="no-default-active-elevate text-xs gap-1 border-green-500/30 text-green-700 dark:text-green-400">
            <CheckCircle2 className="h-3 w-3" />
            {variant === "finalize" ? "Filed & Locked" : "Export Complete"}
          </Badge>
        </motion.div>

        <motion.p
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.1, duration: 0.5 }}
          className="text-muted-foreground leading-relaxed max-w-lg mx-auto"
          data-testid="text-success-description"
        >
          Your {taxYear} Tax Pack has been generated and a copy is now permanently locked in your 7-Year Vault.
          Whether you're filing via TurboTax, an Accountant, or the IRS Direct File, you have everything you need.
        </motion.p>
      </div>

      {(filingId || submissionHash) && (
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.3, duration: 0.5 }}
        >
          <Card>
            <CardContent className="py-4 px-4">
              <Button
                variant="ghost"
                className="w-full justify-start gap-2 text-sm font-medium"
                onClick={() => setShowDetails(!showDetails)}
                data-testid="button-toggle-filing-details"
              >
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span data-testid="text-filing-details-label">Filing Details</span>
                <span className="text-xs text-muted-foreground ml-auto" data-testid="text-filing-details-toggle">
                  {showDetails ? "Hide" : "Show"}
                </span>
              </Button>
              <AnimatePresence>
                {showDetails && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="overflow-hidden"
                  >
                    <div className="space-y-1 pt-3">
                      {filingId && (
                        <p className="text-xs text-muted-foreground">
                          Filing ID: <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded" data-testid="text-success-filing-id">{filingId}</code>
                        </p>
                      )}
                      {submissionHash && (
                        <p className="text-xs text-muted-foreground">
                          Submission Hash: <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded" data-testid="text-success-submission-hash">{submissionHash}</code>
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground" data-testid="text-success-preparer-type">
                        Preparer Type: <span className="font-medium">Self-Prepared</span> | App Role: <span className="font-medium">ERO</span>
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </CardContent>
          </Card>
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.5, duration: 0.5 }}
      >
        <Card>
          <CardContent className="py-4 px-4 space-y-3">
            <p className="text-sm font-medium" data-testid="text-next-steps-label">Next Steps</p>
            <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
              <li data-testid="text-next-step-1">Open the CSV files in Excel or Google Sheets to verify totals</li>
              <li data-testid="text-next-step-2">Upload the PDF summary to TurboTax, FreeTaxUSA, or your accountant's portal</li>
              <li data-testid="text-next-step-3">Keep the Receipt Vault ZIP as your IRS backup documentation</li>
            </ol>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.8, duration: 0.5 }}
      >
        <Card className="border-green-500/20 bg-green-500/5 dark:bg-green-500/10">
          <CardContent className="py-4 px-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="flex items-center gap-3 flex-1">
                <div className="p-2 rounded-md bg-green-500/10">
                  <Gift className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-sm font-medium" data-testid="text-referral-headline">
                    Refer a fellow driver
                  </p>
                  <p className="text-xs text-muted-foreground" data-testid="text-referral-description">
                    Get 1 month of MCTUSA Premium free
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                className="gap-2 shrink-0"
                onClick={handleCopyReferral}
                data-testid="button-copy-referral"
              >
                <Copy className="h-4 w-4" />
                Copy Referral Code
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 2.0, duration: 0.5 }}
        className="flex flex-col sm:flex-row gap-3 pt-2"
      >
        <Button
          variant="outline"
          className="flex-1 gap-2"
          onClick={() => window.open("https://www.irs.gov/forms-pubs/about-schedule-c-form-1040", "_blank")}
          data-testid="button-irs-schedule-c-link"
        >
          <ExternalLink className="h-4 w-4" />
          IRS Schedule C Guide
        </Button>
        {variant === "finalize" && onGoToExport && (
          <Button
            variant="outline"
            className="flex-1 gap-2"
            onClick={onGoToExport}
            data-testid="button-go-to-export"
          >
            <FileText className="h-4 w-4" />
            Go to Export Center
          </Button>
        )}
        {onClose && (
          <Button className="flex-1" onClick={onClose} data-testid="button-success-done">
            Done
          </Button>
        )}
      </motion.div>
    </motion.div>
  );
}
