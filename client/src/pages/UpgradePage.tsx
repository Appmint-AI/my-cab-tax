import { useState, useEffect } from "react";
import { Link, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useCreateCheckoutSession, useSubscription } from "@/hooks/use-subscription";
import { useAuth } from "@/hooks/use-auth";
import { useRegion } from "@/hooks/use-region";
import {
  CarFront,
  ArrowLeft,
  Shield,
  Crown,
  CheckCircle,
  Lock,
  Loader2,
  Zap,
  CreditCard,
  ShieldCheck,
  CalendarDays,
  XCircle,
  FileText,
  Sparkles,
  PartyPopper,
} from "lucide-react";
import { SiStripe } from "react-icons/si";

function formatNextBillingDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function SuccessOverlay({ name, region }: { name: string; region: string }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      window.location.href = "/dashboard";
    }, 8000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" data-testid="overlay-success">
      <Card className="max-w-lg w-full mx-4 p-0 overflow-hidden border-0 shadow-2xl">
        <div className="bg-gradient-to-br from-emerald-500 to-emerald-700 p-8 text-center text-white">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-white/20 mb-4">
            <PartyPopper className="h-8 w-8" />
          </div>
          <h2 className="font-bold text-2xl sm:text-3xl mb-2" data-testid="text-success-title">
            Welcome to the Head Office{name ? `, ${name}` : ""}.
          </h2>
          <p className="text-emerald-100 text-lg font-medium" data-testid="text-success-subtitle">
            Your {region === "US" ? "IRS" : "HMRC"} Shield is now ACTIVE.
          </p>
        </div>
        <CardContent className="p-6 bg-background text-center space-y-3">
          <div className="flex items-center justify-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
            <ShieldCheck className="h-5 w-5" />
            <span className="font-medium">7-Year Digital Vault Activated</span>
          </div>
          <div className="flex items-center justify-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
            <CalendarDays className="h-5 w-5" />
            <span className="font-medium">{region === "US" ? "IRS 1040-ES Filing Unlocked" : "Automated MTD Filing Unlocked"}</span>
          </div>
          <div className="flex items-center justify-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
            <Zap className="h-5 w-5" />
            <span className="font-medium">{region === "US" ? "State Tax Filing Ready" : "Universal Credit Sync Ready"}</span>
          </div>
          <Link href="/dashboard">
            <Button className="mt-4 w-full" size="lg" data-testid="button-go-dashboard">
              Go to Dashboard
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

function CancelledBanner() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div className="mb-6 p-4 border border-amber-300/50 bg-amber-50/50 dark:bg-amber-900/10 dark:border-amber-600/30 rounded-lg flex items-start gap-3" data-testid="banner-cancelled">
      <XCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
      <div className="flex-1">
        <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Payment setup was cancelled</p>
        <p className="text-xs text-amber-700/80 dark:text-amber-400/70 mt-0.5">No charges were made. You can try again whenever you're ready.</p>
      </div>
      <button onClick={() => setDismissed(true)} className="text-amber-600/60 hover:text-amber-600 dark:text-amber-400/60" data-testid="button-dismiss-cancelled">
        <XCircle className="h-4 w-4" />
      </button>
    </div>
  );
}

export default function UpgradePage() {
  const checkoutMutation = useCreateCheckoutSession();
  const { data: subscription } = useSubscription();
  const { user } = useAuth();
  const { isUS, isUK, formatCurrency } = useRegion();
  const isPro = subscription?.tier === "pro";
  const searchParams = useSearch();
  const params = new URLSearchParams(searchParams);
  const showSuccess = params.get("upgrade") === "success" || params.get("session_id") !== null;
  const showCancelled = params.get("cancelled") === "true";

  const userName = user?.firstName || "";

  if (showSuccess) {
    return <SuccessOverlay name={userName} region={isUS ? "US" : "UK"} />;
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <nav className="border-b border-border/40 backdrop-blur-sm fixed w-full z-50 bg-background/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="bg-primary p-2 rounded-lg text-primary-foreground">
              <CarFront className="w-6 h-6" />
            </div>
            <span className="font-display font-bold text-xl tracking-tight">My Cab Tax</span>
          </div>
          <Link href="/dashboard">
            <Button variant="outline" data-testid="button-back-dashboard">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Button>
          </Link>
        </div>
      </nav>

      <main className="pt-24 pb-16 px-4 sm:px-6 lg:px-8 max-w-2xl mx-auto flex-1 w-full">
        {showCancelled && <CancelledBanner />}

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 mb-4">
            <Shield className="h-7 w-7 text-primary" />
          </div>
          <h1 className="font-display font-bold text-3xl sm:text-4xl mb-3" data-testid="text-upgrade-title">
            {isPro ? "Your Head Office is Active" : "Secure Your Head Office"}
          </h1>
          <p className="text-muted-foreground text-base sm:text-lg max-w-xl mx-auto leading-relaxed" data-testid="text-upgrade-subtitle">
            {isPro
              ? isUS
                ? "You have full access to IRS 1040-ES Filing, Schedule C Automation, State Tax Filing, and your 7-Year Digital Vault."
                : "You have full access to Automated HMRC MTD Filing, Universal Credit Sync, and your 7-Year Digital Vault."
              : isUS
                ? "Connect your payment method to activate IRS 1040-ES Filing, Schedule C Automation, State Tax Filing, and your 7-Year Digital Vault."
                : "Connect your payment method to activate Automated HMRC MTD Filing, Universal Credit Sync, and your 7-Year Digital Vault."}
          </p>
        </div>

        <Card className="mb-6 border-emerald-200/50 dark:border-emerald-800/30 bg-emerald-50/30 dark:bg-emerald-950/10" data-testid="card-trust-box">
          <CardContent className="p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 shrink-0">
                <Lock className="h-5 w-5 text-emerald-700 dark:text-emerald-400" />
              </div>
              <div>
                <h3 className="font-semibold text-base mb-1.5 text-emerald-900 dark:text-emerald-300" data-testid="text-security-title">
                  Bank-Level Security
                </h3>
                <p className="text-sm leading-relaxed text-emerald-800/80 dark:text-emerald-400/80" data-testid="text-security-description">
                  We use Stripe to process payments. MCTUSA never sees or stores your full card details. Your data is encrypted using 256-bit SSL — the same standard used by the UK's leading banks.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="mb-6 border-primary/20" data-testid="card-payment-action">
          <CardContent className="p-5 sm:p-8">
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Subscription</p>
                  <p className="text-2xl sm:text-3xl font-bold" data-testid="text-price">
                    {isUS ? "$19.99" : "£17.99"}<span className="text-base font-normal text-muted-foreground"> / month</span>
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">{isUS ? "(Sales Tax may apply)" : "(VAT Inclusive)"}</p>
                </div>
                <div className="p-3 rounded-full bg-primary/10">
                  <Crown className="h-6 w-6 text-primary" />
                </div>
              </div>

              <div className="border-t border-border/50 pt-4 space-y-3">
                <div className="flex items-center gap-3 text-sm">
                  <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span>
                    <span className="text-muted-foreground">Next Billing Date: </span>
                    <span className="font-medium" data-testid="text-next-billing">{formatNextBillingDate()}</span>
                  </span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <XCircle className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground">No contracts. Cancel anytime with one tap.</span>
                </div>
              </div>

              <div className="space-y-4 border-t border-border/50 pt-4">
                <h4 className="text-sm font-semibold">Everything included:</h4>
                <div className="grid gap-2.5">
                  {(isUS ? [
                    { icon: ShieldCheck, text: "IRS 1040-ES Quarterly Filing" },
                    { icon: FileText, text: "Schedule C Automation" },
                    { icon: Zap, text: "State Tax Filing" },
                    { icon: Shield, text: "Audit Defense Center Access" },
                    { icon: Sparkles, text: "AI Receipt Scanner with OCR" },
                    { icon: CreditCard, text: "7-Year Digital Vault" },
                  ] : [
                    { icon: ShieldCheck, text: "Automated HMRC MTD Filing" },
                    { icon: Zap, text: "Universal Credit Sync" },
                    { icon: FileText, text: "7-Year Digital Vault" },
                    { icon: Sparkles, text: "AI Receipt Scanner with OCR" },
                    { icon: CreditCard, text: "Auto-Grossing (25% Rule)" },
                    { icon: Shield, text: "Audit Defence Centre Access" },
                  ]).map(({ icon: Icon, text }) => (
                    <div key={text} className="flex items-center gap-2.5 text-sm">
                      <div className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/10">
                        <Icon className="h-3 w-3 text-primary" />
                      </div>
                      <span>{text}</span>
                    </div>
                  ))}
                </div>
              </div>

              {isPro ? (
                <div className="text-center pt-2">
                  <Badge className="text-sm py-1.5 px-4 bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800">
                    <CheckCircle className="h-4 w-4 mr-1.5" />
                    Head Office Active
                  </Badge>
                </div>
              ) : (
                <div className="space-y-3 pt-2">
                  <Button
                    size="lg"
                    className="w-full h-12 text-base font-semibold"
                    data-testid="button-upgrade-checkout"
                    onClick={() => checkoutMutation.mutate()}
                    disabled={checkoutMutation.isPending}
                  >
                    {checkoutMutation.isPending ? (
                      <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    ) : (
                      <CreditCard className="h-5 w-5 mr-2" />
                    )}
                    Set Up Secure Payment
                  </Button>

                  <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                    <Lock className="h-3.5 w-3.5" />
                    <span>Powered by</span>
                    <SiStripe className="h-8 w-auto text-[#635BFF] dark:text-[#A39BFF]" />
                  </div>

                  <p className="text-xs text-center text-muted-foreground leading-relaxed" data-testid="text-redirect-notice">
                    By clicking, you will be redirected to our secure payment partner, Stripe, to finalise your setup.
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-blue-200/30 dark:border-blue-800/20 bg-blue-50/20 dark:bg-blue-950/5" data-testid="card-vat-notice">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-300 mb-1">{isUS ? "Tax Invoice" : "VAT Invoicing"}</h4>
                <p className="text-xs leading-relaxed text-blue-800/70 dark:text-blue-400/70">
                  {isUS
                    ? "A tax invoice is automatically emailed to you after every payment. This is a deductible business expense under Schedule C — keep it for your records."
                    : "A UK-compliant VAT invoice is automatically emailed to you after every payment. This is a deductible business expense — keep it for your records."}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="mt-8 text-center">
          <p className="text-xs text-muted-foreground">
            Questions? Visit our{" "}
            <Link href="/legal?tab=subscriptions" className="text-primary underline">Subscription Terms</Link>
            {" "}or{" "}
            <Link href="/support" className="text-primary underline">contact Legal & Privacy Support</Link>.
          </p>
        </div>
      </main>

      <footer className="py-12 border-t border-border/40 mt-auto bg-background">
        <div className="max-w-7xl mx-auto px-4 text-center text-muted-foreground text-sm">
          <p>&copy; {new Date().getFullYear()} My Cab Tax USA. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
