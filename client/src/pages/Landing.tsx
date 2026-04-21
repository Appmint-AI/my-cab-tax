import { useAuth } from "@/hooks/use-auth";
import { Redirect, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CarFront, Calculator, TrendingUp, ShieldCheck, ArrowRight, Zap, Receipt, MapPin } from "lucide-react";

export default function Landing() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) return null;
  if (isAuthenticated) return <Redirect to="/dashboard" />;

  const login = () => window.location.href = "/api/login";

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <nav className="border-b border-border/40 backdrop-blur-sm fixed w-full z-50 bg-background/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="bg-primary p-1.5 rounded-md text-primary-foreground">
              <CarFront className="w-5 h-5" />
            </div>
            <span className="font-semibold text-lg tracking-tight">My Cab Tax</span>
          </div>
          <Button onClick={login} variant="outline" data-testid="button-login-nav">
            Log In
          </Button>
        </div>
      </nav>

      <section className="relative pt-28 pb-24 px-4 sm:px-6 lg:px-8 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[hsl(216,65%,8%)] via-[hsl(216,55%,12%)] to-[hsl(216,65%,8%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,hsl(160,100%,36%,0.08),transparent_60%)]" />

        <div className="relative max-w-5xl mx-auto text-center">
          <Badge variant="outline" className="mb-6 text-xs border-white/20 text-white/70 no-default-active-elevate" data-testid="badge-hero-tagline">
            <Zap className="h-3 w-3 mr-1.5" />
            Built for drivers, by tax professionals
          </Badge>

          <h1 className="font-semibold text-3xl sm:text-5xl md:text-6xl tracking-tight mb-5 text-white leading-tight">
            Your Tax Season,{" "}
            <span className="text-[hsl(160,100%,45%)]">Simplified</span>
          </h1>

          <p className="text-base sm:text-lg text-white/60 max-w-2xl mx-auto mb-8 leading-relaxed">
            Track rideshare income, maximize deductions, and estimate your taxes in real-time. 
            The only tax app built specifically for gig economy drivers.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button size="lg" onClick={login} className="gap-2" data-testid="button-login-hero">
              Start Tracking Free
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="mt-16 grid grid-cols-3 gap-4 max-w-lg mx-auto">
            <div className="text-center">
              <p className="text-2xl font-semibold text-white">72.5</p>
              <p className="text-[11px] text-white/40 mt-0.5">cents/mile (2026)</p>
            </div>
            <div className="text-center border-x border-white/10">
              <p className="text-2xl font-semibold text-[hsl(160,100%,45%)]">$0</p>
              <p className="text-[11px] text-white/40 mt-0.5">tax on tips</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-semibold text-white">$40K</p>
              <p className="text-[11px] text-white/40 mt-0.5">SALT cap (2026)</p>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-xl font-semibold mb-2">Everything you need to file with confidence</h2>
            <p className="text-sm text-muted-foreground">Track, deduct, and file — all in one place.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { icon: Calculator, title: "Real-time Tax Estimates", desc: "Know exactly what you owe as you earn. No surprises at year-end." },
              { icon: TrendingUp, title: "Smart Expense Tracking", desc: "Log gas, car washes, and maintenance. Every deduction counts." },
              { icon: MapPin, title: "IRS-Grade Mileage Log", desc: "Compliant with IRS Pub. 463. Track business purpose and odometer readings." },
              { icon: Receipt, title: "AI Receipt Scanning", desc: "Snap a photo. Our AI extracts vendor, amount, and category automatically." },
            ].map((feature) => (
              <Card key={feature.title} className="border-border/50">
                <CardContent className="p-5 space-y-3">
                  <div className="h-9 w-9 bg-primary/10 text-primary rounded-md flex items-center justify-center">
                    <feature.icon className="w-4 h-4" />
                  </div>
                  <h3 className="font-medium text-sm">{feature.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{feature.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 bg-card border-t border-border/40">
        <div className="max-w-3xl mx-auto px-4 text-center space-y-4">
          <ShieldCheck className="h-8 w-8 text-primary mx-auto" />
          <h2 className="text-xl font-semibold">Enterprise-grade Security</h2>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-xl mx-auto">
            Protected by Auth0 with multi-factor authentication and biometric login. 
            Your financial data is encrypted end-to-end and never shared.
          </p>
          <Button size="lg" onClick={login} variant="outline" className="mt-4" data-testid="button-login-security">
            Get Started
          </Button>
        </div>
      </section>

      <footer className="py-8 border-t border-border/40 mt-auto bg-background">
        <div className="max-w-7xl mx-auto px-4 flex flex-col items-center gap-2 text-muted-foreground text-xs">
          <div className="flex gap-4 flex-wrap justify-center">
            <Link href="/terms" className="underline hover-elevate px-2 py-1 rounded-md" data-testid="link-terms-footer">
              Terms of Service
            </Link>
            <Link href="/privacy" className="underline hover-elevate px-2 py-1 rounded-md" data-testid="link-privacy-footer">
              Privacy Policy
            </Link>
            <Link href="/legal" className="underline hover-elevate px-2 py-1 rounded-md" data-testid="link-legal-footer">
              Full Legal Center
            </Link>
            <Link href="/support" className="underline hover-elevate px-2 py-1 rounded-md" data-testid="link-support-footer">
              Legal & Privacy Support
            </Link>
          </div>
          <p className="text-[11px] text-muted-foreground" data-testid="text-legal-contact-footer">Legal Notices: legal@mycabtax.com</p>
          <p>&copy; {new Date().getFullYear()} My Cab Tax USA. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
