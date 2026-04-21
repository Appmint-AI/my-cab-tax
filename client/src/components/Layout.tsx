import { ReactNode, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/use-auth";
import { useRegion } from "@/hooks/use-region";
import { getSegmentConfig } from "@/lib/segment-config";
import { SUPPORTED_LANGUAGES } from "@/lib/i18n";
import { RegionDetector } from "@/components/RegionDetector";
import { VoiceBookkeeper } from "@/components/VoiceBookkeeper";
import { PwaInstallPrompt } from "@/components/PwaInstallPrompt";
import { 
  LayoutDashboard, 
  Wallet, 
  Receipt, 
  LogOut, 
  CarFront,
  Package,
  Layers,
  Menu,
  Settings,
  MapPin,
  ScanLine,
  Shield,
  Download,
  Globe,
  FileSpreadsheet,
  Banknote,
  RefreshCw,
  Fuel,
  Wrench,
  Route,
  Eye,
  EyeOff,
  CalendarClock,
  FileText,
} from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useState } from "react";

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const { t, i18n } = useTranslation();
  const { isUK, isUS, isCA, isMX, taxModules, region, currencySymbol, flag } = useRegion();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const segmentConfig = getSegmentConfig(user?.userSegment);
  const BrandIcon = user?.userSegment === "hybrid" ? Layers : user?.userSegment === "delivery" ? Package : CarFront;

  useEffect(() => {
    const segment = user?.userSegment || "taxi";
    document.documentElement.setAttribute("data-segment", segment);
    return () => {
      document.documentElement.removeAttribute("data-segment");
    };
  }, [user?.userSegment]);

  const isSimplified = user?.simplifiedView || false;

  const allNavItems = [
    { href: "/dashboard", label: t("nav.dashboard"), icon: LayoutDashboard, simplifiedIcon: LayoutDashboard },
    { href: "/incomes", label: t("nav.income"), icon: Wallet, simplifiedIcon: Wallet },
    { href: "/expenses", label: t("nav.expenses"), icon: Receipt, simplifiedIcon: Receipt },
    { href: "/mileage", label: t("nav.mileage"), icon: MapPin, simplifiedIcon: Route },
    { href: "/receipts", label: t("nav.receipts"), icon: ScanLine, simplifiedIcon: ScanLine },
    { href: "/vehicles", label: t("nav.vehicles"), icon: CarFront, simplifiedIcon: Fuel },
    { href: "/export", label: t("nav.export"), icon: Download, simplifiedIcon: Download, desktopOnly: true },
    { href: "/audit-center", label: t("nav.auditDefense"), icon: Shield, simplifiedIcon: Shield },
    { href: "/sync", label: t("nav.sync"), icon: RefreshCw, simplifiedIcon: RefreshCw },
    { href: "/dac7", label: t("nav.dac7"), icon: FileSpreadsheet, simplifiedIcon: FileSpreadsheet },
    { href: "/currency", label: t("nav.currency"), icon: Banknote, simplifiedIcon: Banknote },
    { href: "/quarterly", label: isUK ? t("nav.quarterly") : t("nav.estimatedTax", "Estimated Tax"), icon: CalendarClock, simplifiedIcon: CalendarClock, regions: ["US", "UK"] as const },
    { href: "/tax-overview", label: t("nav.taxOverview", "Tax Overview"), icon: FileText, simplifiedIcon: FileText, regions: ["UK"] as const },
    { href: "/global-tax", label: "Global Tax", icon: Globe, simplifiedIcon: Globe },
    { href: "/settings", label: t("nav.settings"), icon: Settings, simplifiedIcon: Wrench },
  ];

  const navItems = allNavItems.filter((item) => {
    if (!(item as any).regions) return true;
    return ((item as any).regions as string[]).includes(region);
  });

  const handleLanguageChange = (lang: string) => {
    i18n.changeLanguage(lang);
  };

  const NavContent = () => (
    <div className="flex flex-col h-full bg-sidebar text-sidebar-foreground">
      <div className="p-5 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-segment-accent rounded-md">
            <BrandIcon className="h-5 w-5 text-segment-accent-foreground" />
          </div>
          <div>
            <h1 className="font-semibold text-base leading-tight text-white dark:text-white">My Cab Tax</h1>
            <p className="text-[11px] text-sidebar-foreground/60 mt-0.5" data-testid="badge-segment-label">
              {segmentConfig.shortLabel} Mode {flag}
            </p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-0.5">
        {navItems.map((item) => {
          const isActive = location === item.href;
          const IconComponent = isSimplified ? (item as any).simplifiedIcon || item.icon : item.icon;
          return (
            <Link key={item.href} href={item.href}>
              <div
                data-testid={`link-nav-${item.href.replace("/", "")}`}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors duration-150 cursor-pointer touch-manipulation",
                  isActive
                    ? "bg-sidebar-accent text-white font-medium"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                  (item as any).desktopOnly && "hidden lg:flex",
                  isSimplified && "justify-center md:justify-start"
                )}
                onClick={() => setMobileMenuOpen(false)}
                title={isSimplified ? item.label : undefined}
              >
                <IconComponent className={cn("h-4 w-4 flex-shrink-0", isActive ? "text-white" : "text-sidebar-foreground/50", isSimplified && "h-5 w-5")} />
                {!isSimplified && item.label}
                {isActive && !isSimplified && (
                  <div className="ml-auto w-1.5 h-1.5 rounded-full bg-segment-accent" />
                )}
              </div>
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-sidebar-border">
        <div className="px-2 mb-3">
          <div className="flex items-center gap-2 mb-1.5">
            <Globe className="h-3.5 w-3.5 text-sidebar-foreground/50" />
            <span className="text-[11px] text-sidebar-foreground/50">{t("common.language")}</span>
          </div>
          <Select value={(i18n.language || "en").substring(0, 2).toLowerCase()} onValueChange={handleLanguageChange}>
            <SelectTrigger
              className="h-8 text-xs bg-sidebar-accent/30 border-sidebar-border text-sidebar-foreground"
              data-testid="select-language"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SUPPORTED_LANGUAGES.map((lang) => (
                <SelectItem key={lang.code} value={lang.code} data-testid={`option-lang-${lang.code}`}>
                  {lang.nativeName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-3 px-2 mb-3">
          <Avatar className="h-8 w-8 border border-sidebar-border">
            <AvatarImage src={user?.profileImageUrl || undefined} />
            <AvatarFallback className="bg-sidebar-accent text-sidebar-accent-foreground text-xs font-medium">
              {user?.firstName?.[0]}{user?.lastName?.[0]}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 overflow-hidden">
            <p className="text-sm font-medium text-white dark:text-white truncate">{user?.firstName} {user?.lastName}</p>
            <p className="text-[11px] text-sidebar-foreground/50 truncate">{user?.email}</p>
          </div>
        </div>
        <Button 
          variant="ghost"
          className="w-full justify-start gap-2 text-sidebar-foreground/60"
          onClick={() => logout()}
          data-testid="button-sign-out"
        >
          <LogOut className="h-4 w-4" />
          {t("nav.signOut")}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex">
      {/* Persistent sidebar — always visible on 1024 px+ */}
      <aside className="hidden lg:block w-64 fixed h-full z-30">
        <NavContent />
      </aside>

      {/* Mobile / tablet top bar — hidden on 1024 px+ */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-sidebar backdrop-blur-md border-b border-sidebar-border z-40 px-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-segment-accent rounded-md">
            <BrandIcon className="h-4 w-4 text-segment-accent-foreground" />
          </div>
          <span className="font-semibold text-sm text-white">My Cab Tax</span>
        </div>
        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="text-white hover:bg-sidebar-accent">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-72 border-sidebar-border bg-sidebar">
            <NavContent />
          </SheetContent>
        </Sheet>
      </div>

      <main className="flex-1 lg:ml-64 p-4 lg:p-8 pt-20 lg:pt-8 w-full max-w-full overflow-x-hidden">
        <div className="max-w-6xl mx-auto space-y-6">
          <RegionDetector />
          {children}
        </div>
      </main>
      <VoiceBookkeeper />
      <PwaInstallPrompt />
    </div>
  );
}
