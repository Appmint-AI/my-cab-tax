import { useState, useEffect } from "react";
import { Download, X, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem("pwa-install-dismissed");
    if (dismissed) return;

    const isDesktopChromium =
      !("ontouchstart" in window) &&
      window.innerWidth >= 1024 &&
      (navigator.userAgent.includes("Chrome") || navigator.userAgent.includes("Edg"));

    if (!isDesktopChromium) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setVisible(true);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    setInstalling(true);
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setVisible(false);
    }
    setInstalling(false);
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setVisible(false);
    localStorage.setItem("pwa-install-dismissed", "1");
  };

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 hidden lg:flex items-center gap-3 bg-slate-900 dark:bg-slate-800 text-white shadow-xl rounded-xl px-4 py-3 border border-slate-700 max-w-md w-full"
      data-testid="banner-pwa-install"
    >
      <div className="flex items-center justify-center rounded-lg bg-primary/20 p-2 shrink-0">
        <Monitor className="h-5 w-5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold leading-tight">Install My Cab Tax</p>
        <p className="text-xs text-slate-400 mt-0.5 leading-tight">
          Open instantly from your desktop — works offline too.
        </p>
      </div>
      <Button
        size="sm"
        onClick={handleInstall}
        disabled={installing}
        className="shrink-0 bg-primary hover:bg-primary/90 text-primary-foreground"
        data-testid="button-pwa-install"
      >
        <Download className="h-3.5 w-3.5 mr-1.5" />
        {installing ? "Installing…" : "Install"}
      </Button>
      <button
        onClick={handleDismiss}
        className="shrink-0 text-slate-400 hover:text-white transition-colors"
        aria-label="Dismiss install prompt"
        data-testid="button-pwa-dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
