import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useRegion } from "@/hooks/use-region";
import { AlertTriangle, Scale } from "lucide-react";

const CURRENT_TERMS_VERSION = "1.0";

export function TermsAcceptanceDialog() {
  const { user, isAuthenticated } = useAuth();
  const { taxCopy, isUK } = useRegion();
  const queryClient = useQueryClient();
  const [agreed, setAgreed] = useState(false);
  const [dataRetentionAgreed, setDataRetentionAgreed] = useState(false);

  const acceptMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/accept-terms", { version: CURRENT_TERMS_VERSION }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    },
  });

  const shouldShow = isAuthenticated && user && !user.termsAcceptedAt;
  const canSubmit = agreed && dataRetentionAgreed && !acceptMutation.isPending;

  if (!shouldShow) return null;

  return (
    <Dialog open={true}>
      <DialogContent className="sm:max-w-lg" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="text-xl font-display" data-testid="text-terms-dialog-title">
            Legal Consent Required
          </DialogTitle>
          <DialogDescription>
            Please review and accept our terms to continue.{""}
            {!isUK && " USA-region disclosures reference IRS publications."}
            {isUK && " UK-region disclosures reference HMRC practice."}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-72 pr-4">
          <div className="space-y-4 text-sm text-foreground/80 leading-relaxed">
            <p className="text-xs text-muted-foreground">
              Terms Version {CURRENT_TERMS_VERSION} &mdash; Last Updated: February 2026
            </p>

            <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/5 border border-destructive/20">
              <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-foreground text-sm mb-1">Tax Disclaimer</p>
                <p className="text-xs">
                  <strong>{taxCopy.appConsentBrandLine}</strong>{" "}
                  We do not provide regulated tax, legal, or accounting advice. Calculations depend on information you supply,
                  and you remain solely responsible for filing accuracy.
                  <strong> {taxCopy.legalDisclaimerAuthority}</strong>
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <p className="font-semibold text-foreground">Limitation of Liability</p>
                <p>
                  Detailed monetary caps appear in the full Terms (typically tied to fees paid).
                  We are not liable for {taxCopy.limitationAuthorityPrefix}, penalties, interest, or related downstream losses stemming from use of the app.
                </p>
              </div>

              <div className="flex items-start gap-2 p-3 rounded-md bg-muted/50 border border-border">
                <Scale className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-foreground text-sm mb-1">{taxCopy.arbitrationHeading}</p>
                  <p className="text-xs">{taxCopy.arbitrationBody}</p>
                </div>
              </div>

              <div>
                <p className="font-semibold text-foreground">{taxCopy.privacyHeading}</p>
                <ul className="list-disc pl-5 space-y-1 text-xs mt-1">
                  {taxCopy.privacyBullets.map((line, idx) => (
                    <li key={idx}>{line}</li>
                  ))}
                </ul>
              </div>

              <div>
                <p className="font-semibold text-foreground">{taxCopy.dataRetentionHeading}</p>
                <p>{taxCopy.dataRetentionBody}</p>
              </div>

              <div className="text-xs space-y-1 border rounded-md p-3 bg-muted/20">
                <p className="font-semibold text-foreground">{isUK ? "HMRC checkpoints" : "IRS checkpoints"}</p>
                <p>{taxCopy.primaryEstimatedPayments}</p>
                <p>{taxCopy.secondaryDeadlineNote}</p>
                <p className="text-muted-foreground">{taxCopy.grossIncomeReportingHint}</p>
              </div>
            </div>

            <p className="text-muted-foreground">
              Read the full{" "}
              <Link href="/terms" className="text-primary underline" data-testid="link-full-terms">
                Terms of Service
              </Link>
              {" and "}
              <Link href="/privacy" className="text-primary underline" data-testid="link-full-privacy">
                Privacy Policy
              </Link>
              .
            </p>
          </div>
        </ScrollArea>

        <div className="space-y-3 pt-2">
          <div className="flex items-start gap-3">
            <Checkbox
              id="accept-terms"
              checked={agreed}
              onCheckedChange={(checked) => setAgreed(checked === true)}
              data-testid="checkbox-accept-terms"
            />
            <Label htmlFor="accept-terms" className="text-sm leading-snug cursor-pointer">
              I have read and agree to the Terms of Service (v{CURRENT_TERMS_VERSION}), Privacy Policy, Tax Disclaimers, and Mandatory Arbitration clause.
            </Label>
          </div>

          <div className="flex items-start gap-3">
            <Checkbox
              id="accept-data-retention"
              checked={dataRetentionAgreed}
              onCheckedChange={(checked) => setDataRetentionAgreed(checked === true)}
              data-testid="checkbox-accept-data-retention"
            />
            <Label htmlFor="accept-data-retention" className="text-sm leading-snug cursor-pointer">
              I agree to the <Link href="/terms" className="text-primary underline">Terms of Service</Link> and <Link href="/privacy" className="text-primary underline">Privacy Policy</Link>, including the 7-year secure data retention policy.
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button
            onClick={() => acceptMutation.mutate()}
            disabled={!canSubmit}
            data-testid="button-accept-terms"
          >
            {acceptMutation.isPending ? "Accepting..." : "I Agree"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
