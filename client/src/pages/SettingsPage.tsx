import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Layout } from "@/components/Layout";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Shield, Trash2, User, FileText, AlertTriangle, XCircle, MessageSquare, MapPin, Building, Download, Loader2, CheckCircle, CarFront, Package, ArrowLeftRight, Layers, Eye, EyeOff } from "lucide-react";
import { format } from "date-fns";
import { Link } from "wouter";

const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "DC",
];

export default function SettingsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [dangerDialogOpen, setDangerDialogOpen] = useState(false);
  const [dangerConfirmText, setDangerConfirmText] = useState("");

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/request-data-deletion"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/incomes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tax/summary"] });
      setDeleteDialogOpen(false);
      toast({
        title: "Data Deleted",
        description: "All your tax records have been permanently erased.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete data. Please try again.",
        variant: "destructive",
      });
    },
  });

  const accountDeleteMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/delete-account", {
        confirmation: dangerConfirmText,
      }),
    onSuccess: () => {
      window.location.href = "/";
    },
    onError: (err: any) => {
      toast({
        title: "Error",
        description: err?.message || "Failed to delete account. Please try again.",
        variant: "destructive",
      });
    },
  });

  const confirmationValid = dangerConfirmText === "Permanently Delete";

  return (
    <Layout>
      <div className="space-y-2">
        <h1 className="text-2xl font-display font-bold tracking-tight" data-testid="text-settings-title">Settings</h1>
        <p className="text-muted-foreground text-sm">Manage your account and privacy preferences.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Profile
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Avatar className="h-14 w-14 border-2 border-background shadow-sm">
              <AvatarImage src={user?.profileImageUrl || undefined} />
              <AvatarFallback className="bg-primary/20 text-primary font-bold text-lg">
                {user?.firstName?.[0]}{user?.lastName?.[0]}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-medium text-lg" data-testid="text-profile-name">
                {user?.firstName} {user?.lastName}
              </p>
              <p className="text-sm text-muted-foreground" data-testid="text-profile-email">
                {user?.email}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <IndustrySegmentSettings />

      <DisplayPreferences />

      <TaxJurisdictionSettings />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Legal Consent
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <p className="text-sm text-foreground/80">Terms Accepted:</p>
            {user?.termsAcceptedAt ? (
              <Badge variant="secondary" data-testid="badge-terms-status">
                Accepted on {format(new Date(user.termsAcceptedAt), "MMMM d, yyyy")}
              </Badge>
            ) : (
              <Badge variant="outline" data-testid="badge-terms-status">Not yet accepted</Badge>
            )}
          </div>
          {user?.termsVersion && (
            <div className="flex items-center gap-3 flex-wrap">
              <p className="text-sm text-foreground/80">Version:</p>
              <Badge variant="outline" data-testid="badge-terms-version">v{user.termsVersion}</Badge>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Data Privacy
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-foreground/80 leading-relaxed">
            Under the California Consumer Privacy Act (CCPA), Virginia Consumer Data Protection Act (VCDPA), and other applicable state privacy laws, you have the right to request permanent deletion of your personal data. This satisfies your "Right to be Forgotten" under state privacy laws. This action cannot be undone.
          </p>

          <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" data-testid="button-request-data-deletion">
                <Trash2 className="h-4 w-4 mr-2" />
                Request Data Deletion
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                  Permanently Delete All Data?
                </AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="space-y-3">
                    <p>
                      This action will <strong className="text-foreground">permanently erase all of your tax records</strong> to comply with applicable privacy laws, including:
                    </p>
                    <ul className="list-disc pl-5 space-y-1 text-sm">
                      <li>All income records</li>
                      <li>All expense records</li>
                      <li>Mileage logs and platform fee data</li>
                      <li>Your terms acceptance history</li>
                    </ul>
                    <p className="font-medium text-destructive">
                      This action cannot be undone. Your account will remain active but all financial data will be permanently removed.
                    </p>
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel data-testid="button-cancel-deletion">Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => deleteMutation.mutate()}
                  className="bg-destructive text-destructive-foreground"
                  disabled={deleteMutation.isPending}
                  data-testid="button-confirm-deletion"
                >
                  {deleteMutation.isPending ? "Deleting..." : "Yes, Delete All My Data"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {user?.dataDeletionRequestedAt && (
            <p className="text-xs text-muted-foreground" data-testid="text-deletion-date">
              Last deletion performed: {format(new Date(user.dataDeletionRequestedAt), "MMMM d, yyyy 'at' h:mm a")}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Legal & Privacy Support
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-foreground/80 leading-relaxed">
            Have a data export request, account deletion inquiry, dispute, or security concern? Submit a formal inquiry to our legal team.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href="/terms">
              <Button variant="outline" data-testid="button-terms-link">
                <FileText className="h-4 w-4 mr-2" />
                Terms of Service
              </Button>
            </Link>
            <Link href="/privacy">
              <Button variant="outline" data-testid="button-privacy-link">
                <Shield className="h-4 w-4 mr-2" />
                Privacy Policy
              </Button>
            </Link>
            <Link href="/support">
              <Button variant="outline" data-testid="button-legal-support">
                <MessageSquare className="h-4 w-4 mr-2" />
                Contact Legal & Privacy Support
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Help & Feedback
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-foreground/80 leading-relaxed">
            We're in beta and your feedback helps us build a better product. Report bugs, suggest features, or share your experience.
          </p>
          <Button
            variant="outline"
            onClick={() => window.open("https://forms.gle/mycabtax-beta-feedback", "_blank")}
            data-testid="button-beta-feedback"
          >
            <MessageSquare className="h-4 w-4 mr-2" />
            Send Beta Feedback
          </Button>
        </CardContent>
      </Card>

      <Separator className="my-2" />

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <XCircle className="h-5 w-5" />
            Danger Zone
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-foreground/80 leading-relaxed">
            Deactivate your account and schedule all data for permanent deletion. You will have a 30-day grace period to contact support if you change your mind. After 30 days, your account and all data will be permanently and irreversibly removed.
          </p>

          <AlertDialog
            open={dangerDialogOpen}
            onOpenChange={(open) => {
              setDangerDialogOpen(open);
              if (!open) setDangerConfirmText("");
            }}
          >
            <AlertDialogTrigger asChild>
              <Button
                variant="destructive"
                data-testid="button-delete-account"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete My Account and Data
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                  <AlertTriangle className="h-5 w-5" />
                  Delete Account Permanently?
                </AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="space-y-3">
                    <p>
                      This will <strong className="text-foreground">deactivate your account</strong> and schedule all associated data for permanent deletion after a 30-day grace period, including:
                    </p>
                    <ul className="list-disc pl-5 space-y-1 text-sm">
                      <li>All mileage logs</li>
                      <li>All expense receipts and records</li>
                      <li>All income and platform fee records</li>
                      <li>All tax calculations and summaries</li>
                      <li>Your profile and consent history</li>
                    </ul>
                    <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/5 border border-destructive/20">
                      <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                      <p className="text-xs leading-relaxed">
                        <strong>IRS Reminder:</strong> The IRS requires you to keep tax records for at least 3 years. Make sure you have exported or saved your records before proceeding.
                      </p>
                    </div>
                    <div className="space-y-2 pt-1">
                      <Label htmlFor="danger-confirm-input" className="text-sm text-foreground">
                        Type <strong className="text-destructive">Permanently Delete</strong> to confirm
                      </Label>
                      <Input
                        id="danger-confirm-input"
                        value={dangerConfirmText}
                        onChange={(e) => setDangerConfirmText(e.target.value)}
                        placeholder="Permanently Delete"
                        autoComplete="off"
                        data-testid="input-danger-confirm"
                      />
                    </div>
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel data-testid="button-danger-cancel">
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => accountDeleteMutation.mutate()}
                  disabled={!confirmationValid || accountDeleteMutation.isPending}
                  className="bg-destructive text-destructive-foreground"
                  data-testid="button-danger-confirm-delete"
                >
                  {accountDeleteMutation.isPending ? "Deleting Account..." : "Confirm Delete"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </Layout>
  );
}

interface JurisdictionData {
  stateCode: string | null;
  localTaxEnabled: boolean;
  localTaxJurisdiction: string | null;
  noIncomeTaxStates: string[];
  localJurisdictions: Record<string, { name: string; rate: number; portalUrl: string }>;
}

function DisplayPreferences() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (enabled: boolean) =>
      apiRequest("PATCH", "/api/user/simplified-view", { enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({ title: "Display Updated", description: "Your view preference has been saved." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update display preference.", variant: "destructive" });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {user?.simplifiedView ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
          Display Preferences
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="simplified-view" className="text-sm font-medium">Simplified View</Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Use icons instead of text labels in the sidebar navigation
            </p>
          </div>
          <Switch
            id="simplified-view"
            checked={user?.simplifiedView || false}
            onCheckedChange={(val) => mutation.mutate(val)}
            disabled={mutation.isPending}
            data-testid="switch-simplified-view"
          />
        </div>
        {user?.simplifiedView && (
          <div className="p-3 rounded-md bg-muted/50 text-xs text-muted-foreground flex items-center gap-2">
            <EyeOff className="h-3.5 w-3.5" />
            Simplified View is active — sidebar shows icons only. Hover over icons to see labels.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function IndustrySegmentSettings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const segmentMutation = useMutation({
    mutationFn: (segment: string) =>
      apiRequest("PATCH", "/api/user/segment", { segment }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({
        title: "Industry Updated",
        description: "Your dashboard and suggestions have been updated.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update industry. Please try again.",
        variant: "destructive",
      });
    },
  });

  const currentSegment = user?.userSegment || "taxi";

  const segmentOptions = [
    { id: "taxi", label: "Taxi / Rideshare", sub: "Uber, Lyft, Taxi", Icon: CarFront },
    { id: "delivery", label: "Delivery Courier", sub: "DoorDash, Instacart", Icon: Package },
    { id: "hybrid", label: "Show Both (Hybrid)", sub: "Multi-app drivers", Icon: Layers },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ArrowLeftRight className="h-5 w-5" />
          Industry
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Switch between rideshare, delivery, or hybrid to see relevant expense categories, income sources, and tax tips.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {segmentOptions.map(({ id, label, sub, Icon }) => {
            const isActive = currentSegment === id;
            return (
              <Button
                key={id}
                variant={isActive ? "default" : "outline"}
                className="justify-start gap-3"
                onClick={() => segmentMutation.mutate(id)}
                disabled={segmentMutation.isPending}
                data-testid={`button-segment-${id}`}
              >
                <Icon className="h-5 w-5 shrink-0" />
                <div className="text-left">
                  <p className="font-medium text-sm">{label}</p>
                  <p className={`text-xs ${isActive ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{sub}</p>
                </div>
              </Button>
            );
          })}
        </div>
        {segmentMutation.isPending && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Updating...
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TaxJurisdictionSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: jurisdiction, isLoading } = useQuery<JurisdictionData>({
    queryKey: ["/api/jurisdiction"],
  });

  const [stateCode, setStateCode] = useState<string>("");
  const [localTaxEnabled, setLocalTaxEnabled] = useState(false);
  const [localTaxJurisdiction, setLocalTaxJurisdiction] = useState<string>("");
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (jurisdiction) {
      setStateCode(jurisdiction.stateCode || "");
      setLocalTaxEnabled(jurisdiction.localTaxEnabled);
      setLocalTaxJurisdiction(jurisdiction.localTaxJurisdiction || "");
    }
  }, [jurisdiction]);

  const saveMutation = useMutation({
    mutationFn: () =>
      apiRequest("PATCH", "/api/jurisdiction", {
        stateCode: stateCode || null,
        localTaxEnabled,
        localTaxJurisdiction: localTaxEnabled ? (localTaxJurisdiction || null) : null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jurisdiction"] });
      toast({ title: "Saved", description: "Tax jurisdiction settings updated." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save jurisdiction settings.", variant: "destructive" });
    },
  });

  const handleGenerateLocalPDF = async () => {
    setGenerating(true);
    try {
      const res = await fetch("/api/local-tax/generate", { method: "POST", credentials: "include" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to generate");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `MCTUSA_Local_Tax_${new Date().getFullYear()}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: "Downloaded", description: "Local tax statement PDF has been downloaded." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const noTaxStates = jurisdiction?.noIncomeTaxStates || [];
  const isNoTaxState = stateCode ? noTaxStates.includes(stateCode) : false;
  const localJurisdictions = jurisdiction?.localJurisdictions || {};
  const selectedLocal = localTaxJurisdiction ? localJurisdictions[localTaxJurisdiction] : null;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Tax Filing Jurisdiction
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading jurisdiction settings...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="h-5 w-5" />
          Tax Filing Jurisdiction
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm text-muted-foreground">
          Configure your state and local tax filing settings. Your $50 filing fee covers Federal + State + Local — the complete bundle.
        </p>

        <div className="space-y-2">
          <Label htmlFor="stateCode">Filing State</Label>
          <Select value={stateCode} onValueChange={setStateCode}>
            <SelectTrigger data-testid="select-jurisdiction-state">
              <SelectValue placeholder="Select your state" />
            </SelectTrigger>
            <SelectContent>
              {US_STATES.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {stateCode && (
            <div className="flex items-center gap-2 flex-wrap">
              {isNoTaxState ? (
                <Badge variant="secondary" className="no-default-active-elevate" data-testid="badge-no-state-tax">
                  <CheckCircle className="mr-1 h-3 w-3" />
                  No state income tax in {stateCode}
                </Badge>
              ) : (
                <Badge variant="default" className="no-default-active-elevate" data-testid="badge-cfsf-eligible">
                  <CheckCircle className="mr-1 h-3 w-3" />
                  CF/SF Eligible — auto-forwarded to {stateCode}
                </Badge>
              )}
            </div>
          )}
          {stateCode && !isNoTaxState && (
            <p className="text-xs text-muted-foreground">
              Your federal return data will be automatically forwarded to {stateCode} via the IRS Combined Federal/State Filing (CF/SF) Program. No separate state filing needed.
            </p>
          )}
        </div>

        <Separator />

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-0">
              <Label htmlFor="localTaxToggle" className="flex items-center gap-2 cursor-pointer">
                <Building className="h-4 w-4" />
                Local Tax Filing
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Does your city or county require a separate local earned income tax (EIT) filing?
              </p>
            </div>
            <Switch
              id="localTaxToggle"
              checked={localTaxEnabled}
              onCheckedChange={setLocalTaxEnabled}
              data-testid="switch-local-tax"
            />
          </div>

          {localTaxEnabled && (
            <div className="space-y-3">
              <div>
                <Label htmlFor="localJurisdiction">Local Jurisdiction</Label>
                <Select value={localTaxJurisdiction} onValueChange={setLocalTaxJurisdiction}>
                  <SelectTrigger data-testid="select-local-jurisdiction">
                    <SelectValue placeholder="Select your jurisdiction" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(localJurisdictions).map(([code, info]) => (
                      <SelectItem key={code} value={code}>
                        {info.name} ({info.rate}%)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedLocal && (
                <div className="p-3 rounded-lg border border-border/60 bg-muted/30 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{selectedLocal.name}</span>
                    <Badge variant="outline" className="no-default-active-elevate text-xs">{selectedLocal.rate}% rate</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    As of 2026, {selectedLocal.name} may require electronic filing. MCTUSA will generate a Local EIT Statement PDF you can upload to the city portal.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleGenerateLocalPDF}
                    disabled={generating}
                    data-testid="button-generate-local-pdf"
                  >
                    {generating ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Download className="mr-1 h-3 w-3" />}
                    Download Local Tax Statement
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        <Button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          data-testid="button-save-jurisdiction"
        >
          {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
          Save Jurisdiction Settings
        </Button>
      </CardContent>
    </Card>
  );
}
