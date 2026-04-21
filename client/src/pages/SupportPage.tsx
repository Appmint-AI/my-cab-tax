import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { CarFront, ArrowLeft, Send, Shield, CheckCircle } from "lucide-react";

const inquiryTypes = [
  { value: "legal_inquiry", label: "General Legal Inquiry" },
  { value: "data_export", label: "Data Export Request (GDPR/CCPA)" },
  { value: "account_deletion", label: "Account Deletion Inquiry" },
  { value: "dispute_resolution", label: "Dispute Resolution / Arbitration" },
  { value: "security_concern", label: "Report a Security Concern" },
];

export default function SupportPage() {
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [inquiryType, setInquiryType] = useState("");
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const submitMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/support-inquiry", {
        inquiryType,
        message,
      }),
    onSuccess: () => {
      setSubmitted(true);
      toast({
        title: "Inquiry Submitted",
        description: "Our legal team will respond within 5 business days.",
      });
    },
    onError: (err: any) => {
      toast({
        title: "Error",
        description: err?.message || "Failed to submit inquiry. Please try again.",
        variant: "destructive",
      });
    },
  });

  const canSubmit = inquiryType && message.length >= 10 && !submitMutation.isPending;

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
          <Link href={isAuthenticated ? "/settings" : "/"}>
            <Button variant="outline" data-testid="button-back">
              <ArrowLeft className="w-4 h-4 mr-2" />
              {isAuthenticated ? "Back to Settings" : "Back to Home"}
            </Button>
          </Link>
        </div>
      </nav>

      <main className="pt-24 pb-16 px-4 sm:px-6 lg:px-8 max-w-2xl mx-auto flex-1 w-full">
        <div className="mb-8">
          <h1 className="font-display font-bold text-3xl sm:text-4xl mb-2" data-testid="text-support-title">
            Legal & Privacy Support
          </h1>
          <p className="text-muted-foreground">
            Submit a formal inquiry to our legal and privacy team. All requests are processed within 5 business days.
          </p>
        </div>

        {submitted ? (
          <Card className="p-8 text-center" data-testid="card-submission-success">
            <CheckCircle className="h-12 w-12 text-primary mx-auto mb-4" />
            <h2 className="font-display font-bold text-xl mb-2">Inquiry Submitted</h2>
            <p className="text-muted-foreground mb-4" data-testid="text-submission-message">
              Your inquiry has been sent to our legal team at legal@mycabtax.com. 
              A confirmation email with your reference ID has been sent to your account email address.
              We will respond within 5 business days. If this is a CCPA data deletion request, it will be processed within 30 days.
            </p>
            <div className="flex gap-3 justify-center flex-wrap">
              <Button onClick={() => { setSubmitted(false); setInquiryType(""); setMessage(""); }} variant="outline" data-testid="button-new-inquiry">
                Submit Another Inquiry
              </Button>
              <Link href={isAuthenticated ? "/settings" : "/"}>
                <Button data-testid="button-return">
                  Return to {isAuthenticated ? "Settings" : "Home"}
                </Button>
              </Link>
            </div>
          </Card>
        ) : (
          <Card data-testid="card-support-form">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Submit an Inquiry
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {isAuthenticated && user && (
                <div className="text-sm text-muted-foreground p-3 rounded-md bg-muted/50 space-y-1">
                  <p>Submitting as: <span className="font-medium text-foreground">{user.firstName} {user.lastName}</span> ({user.email})</p>
                  <p className="text-xs">Your Auth0 ID will be automatically included for secure reference.</p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="inquiry-type">Nature of Inquiry</Label>
                <Select value={inquiryType} onValueChange={setInquiryType}>
                  <SelectTrigger id="inquiry-type" data-testid="select-inquiry-type">
                    <SelectValue placeholder="Select the type of inquiry" />
                  </SelectTrigger>
                  <SelectContent>
                    {inquiryTypes.map((type) => (
                      <SelectItem key={type.value} value={type.value} data-testid={`option-${type.value}`}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="support-message">Details</Label>
                <Textarea
                  id="support-message"
                  placeholder="Please describe your request in detail. Include any relevant dates, reference numbers, or specific data you're requesting."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="min-h-[150px] resize-y"
                  data-testid="textarea-support-message"
                />
                <p className="text-xs text-muted-foreground">
                  Minimum 10 characters. Maximum 5,000 characters. ({message.length}/5,000)
                </p>
              </div>

              {!isAuthenticated && (
                <div className="p-3 rounded-md bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-500/30">
                  <p className="text-sm text-yellow-700 dark:text-yellow-300">
                    You must be logged in to submit an inquiry. Your Auth0 ID is required for identity verification.
                  </p>
                </div>
              )}

              <Button
                onClick={() => submitMutation.mutate()}
                disabled={!canSubmit || !isAuthenticated}
                className="w-full"
                data-testid="button-submit-inquiry"
              >
                {submitMutation.isPending ? (
                  "Submitting..."
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Submit Inquiry
                  </>
                )}
              </Button>

              <p className="text-xs text-muted-foreground text-center">
                For general questions, see our{" "}
                <Link href="/legal" className="text-primary underline">Legal Center</Link>
                {" "}or{" "}
                <Link href="/legal?tab=privacy" className="text-primary underline">Privacy Policy</Link>.
              </p>
            </CardContent>
          </Card>
        )}
      </main>

      <footer className="py-12 border-t border-border/40 mt-auto bg-background">
        <div className="max-w-7xl mx-auto px-4 text-center text-muted-foreground text-sm">
          <p>&copy; {new Date().getFullYear()} My Cab Tax USA. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
