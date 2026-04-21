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
import { AlertTriangle, Scale } from "lucide-react";

const CURRENT_TERMS_VERSION = "1.0";

export function TermsAcceptanceDialog() {
  const { user, isAuthenticated } = useAuth();
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
            Please review and accept our terms to continue using My Cab Tax USA.
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
                  My Cab Tax USA is a <strong>bookkeeping tool only</strong>, NOT a tax advisory service. We do not provide tax, legal, or accounting advice. All calculations are estimates based on data you enter. You are solely responsible for the accuracy of your data and tax returns. <strong>Consult a qualified CPA or Tax Attorney before submitting any returns to the IRS.</strong>
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <p className="font-semibold text-foreground">Limitation of Liability</p>
                <p>Our total liability shall not exceed the amount you paid in the last 12 months, or $100, whichever is less. We are not liable for any IRS audits, penalties, interest, or tax-related consequences resulting from your use of this app.</p>
              </div>

              <div className="flex items-start gap-2 p-3 rounded-md bg-muted/50 border border-border">
                <Scale className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-foreground text-sm mb-1">Mandatory Arbitration Clause (Section 1.7)</p>
                  <p className="text-xs">
                    Any disputes arising from these Terms or the Service will be resolved through <strong>individual binding arbitration</strong> administered by the American Arbitration Association (AAA) under Delaware law. You waive your right to participate in a class-action lawsuit or class-wide arbitration. Either party may bring an individual action in small claims court. This clause survives termination of your account.
                  </p>
                </div>
              </div>

              <div>
                <p className="font-semibold text-foreground">Privacy Policy (GLBA & CCPA Compliant)</p>
                <p>We collect your name, email, and financial data you enter to provide our services. We use industry-standard encryption. We do not sell your personal financial data to third parties. California residents have additional data rights under CCPA.</p>
              </div>

              <div>
                <p className="font-semibold text-foreground">7-Year Secure Data Retention</p>
                <p>Pro subscribers benefit from our Tax Vault with guaranteed 7-year data retention, exceeding the IRS minimum 3-year recordkeeping requirement. Free Tier users' data is retained while their account is active and subject to a 90-day inactivity deletion policy. All data is stored on encrypted cloud infrastructure with geographically redundant backups. You may request permanent deletion at any time via Settings.</p>
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
