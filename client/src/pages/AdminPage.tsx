import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Users, FileText, DollarSign, AlertTriangle, Car, Receipt, Shield, Activity, Mail, Globe, CheckCircle, XCircle, Clock, Copy, RefreshCw, Bot, Send, Sparkles, Loader2, Trash2, CalendarClock, Inbox, ArrowRight, UserPlus, ToggleLeft, ToggleRight, MessageCircle, Crown, Search, Rocket, MapPin } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface AdminMetrics {
  totalUsers: number;
  proUsers: number;
  verifiedUsers: number;
  totalIncomeRecords: number;
  totalExpenseRecords: number;
  totalMileageLogs: number;
  taxesFiled: number;
  auditLogEntries: number;
  activeComplianceAlerts: number;
}

interface LifecycleMetrics {
  total: number;
  byType: Record<string, number>;
  bySegment: Record<string, number>;
}

interface DnsRecord {
  record: string;
  name: string;
  type: string;
  ttl: string;
  status: string;
  value: string;
  priority?: number;
}

interface DomainDetail {
  id: string;
  name: string;
  status: string;
  records?: DnsRecord[];
  created_at?: string;
  region?: string;
}

function StatusIcon({ status }: { status: string }) {
  if (status === "verified" || status === "active") {
    return <CheckCircle className="h-4 w-4 text-green-500" />;
  }
  if (status === "pending" || status === "not_started") {
    return <Clock className="h-4 w-4 text-yellow-500" />;
  }
  return <XCircle className="h-4 w-4 text-red-500" />;
}

function EmailDomainSection() {
  const { toast } = useToast();
  const [domainInput, setDomainInput] = useState("mctusa.com");

  const { data: dnsData, isLoading: dnsLoading, refetch: refetchDns } = useQuery<{ domains: DomainDetail[] }>({
    queryKey: ["/api/admin/email-domain/dns-records"],
  });

  const addDomainMutation = useMutation({
    mutationFn: async (domain: string) => {
      const res = await apiRequest("POST", "/api/admin/email-domain/add", { domain });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Domain registered with Resend", description: "DNS records are now available below." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/email-domain/dns-records"] });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to add domain", description: err.message, variant: "destructive" });
    },
  });

  const verifyMutation = useMutation({
    mutationFn: async (domainId: string) => {
      const res = await apiRequest("POST", "/api/admin/email-domain/verify", { domainId });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Verification triggered", description: "Resend is checking your DNS records now." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/email-domain/dns-records"] });
    },
    onError: (err: Error) => {
      toast({ title: "Verification failed", description: err.message, variant: "destructive" });
    },
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard" });
  };

  const domains = dnsData?.domains || [];
  const hasDomains = domains.length > 0;

  return (
    <div className="space-y-4">
      <Card data-testid="card-email-domain">
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Globe className="h-4 w-4" />
            Email Domain Authentication
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Register your custom domain with Resend to send emails from @mctusa.com. After registering, add the DNS records below to your domain registrar (GoDaddy, Namecheap, etc.) to authorize sending.
          </p>

          {!hasDomains && (
            <div className="flex items-center gap-2">
              <Input
                value={domainInput}
                onChange={(e) => setDomainInput(e.target.value)}
                placeholder="mctusa.com"
                className="max-w-xs"
                data-testid="input-domain"
              />
              <Button
                onClick={() => addDomainMutation.mutate(domainInput)}
                disabled={addDomainMutation.isPending || !domainInput}
                data-testid="button-add-domain"
              >
                {addDomainMutation.isPending ? "Registering..." : "Register Domain"}
              </Button>
            </div>
          )}

          {dnsLoading && <p className="text-sm text-muted-foreground">Loading domain status...</p>}

          {domains.map((domain) => (
            <div key={domain.id} className="space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <StatusIcon status={domain.status} />
                  <span className="font-medium text-sm">{domain.name}</span>
                  <Badge variant={domain.status === "verified" ? "default" : "secondary"} data-testid={`badge-domain-status-${domain.id}`}>
                    {domain.status}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => refetchDns()}
                    data-testid="button-refresh-dns"
                  >
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Refresh
                  </Button>
                  {domain.status !== "verified" && (
                    <Button
                      size="sm"
                      onClick={() => verifyMutation.mutate(domain.id)}
                      disabled={verifyMutation.isPending}
                      data-testid="button-verify-domain"
                    >
                      {verifyMutation.isPending ? "Verifying..." : "Verify Now"}
                    </Button>
                  )}
                </div>
              </div>

              {domain.records && domain.records.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">DNS Records to Add at Your Registrar</h4>
                  <p className="text-xs text-muted-foreground">
                    Add these records at GoDaddy/Namecheap. SPF authorizes Resend, DKIM signs your emails, and DMARC tells servers what to do with failures.
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse" data-testid="table-dns-records">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 px-3 text-muted-foreground font-medium">Purpose</th>
                          <th className="text-left py-2 px-3 text-muted-foreground font-medium">Type</th>
                          <th className="text-left py-2 px-3 text-muted-foreground font-medium">Name / Host</th>
                          <th className="text-left py-2 px-3 text-muted-foreground font-medium">Value</th>
                          <th className="text-left py-2 px-3 text-muted-foreground font-medium">Status</th>
                          <th className="py-2 px-3"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {domain.records.map((record, idx) => {
                          const purpose = record.record === "SPF" ? "SPF (Authorized Senders)"
                            : record.record === "DKIM" ? "DKIM (Digital Signature)"
                            : record.record === "DMARC" ? "DMARC (Failure Policy)"
                            : record.type === "MX" ? "MX (Mail Exchange)"
                            : record.record || record.type;

                          return (
                            <tr key={idx} className="border-b last:border-b-0">
                              <td className="py-2 px-3 font-medium">{purpose}</td>
                              <td className="py-2 px-3">
                                <Badge variant="secondary">{record.type}</Badge>
                              </td>
                              <td className="py-2 px-3 font-mono text-xs break-all max-w-[200px]">{record.name}</td>
                              <td className="py-2 px-3 font-mono text-xs break-all max-w-[300px]">{record.value}</td>
                              <td className="py-2 px-3">
                                <div className="flex items-center gap-1">
                                  <StatusIcon status={record.status} />
                                  <span className="text-xs">{record.status}</span>
                                </div>
                              </td>
                              <td className="py-2 px-3">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => copyToClipboard(record.value)}
                                  data-testid={`button-copy-dns-${idx}`}
                                >
                                  <Copy className="h-3 w-3" />
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function LifecycleEmailSection() {
  const { data: metrics, isLoading } = useQuery<LifecycleMetrics>({
    queryKey: ["/api/admin/lifecycle-metrics"],
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading email metrics...</p>;
  if (!metrics) return null;

  const typeLabels: Record<string, string> = {
    welcome: "Welcome",
    day_7_nudge: "Day 7 Nudge",
    day_30_milestone: "Day 30 Milestone",
    payment_receipt: "Payment Receipt",
    abandoned_checkout: "Abandoned Checkout",
  };

  const segmentLabels: Record<string, string> = {
    taxi: "Taxi / Rideshare",
    delivery: "Delivery Courier",
    hybrid: "Multi-App (Hybrid)",
    unknown: "Unknown",
  };

  return (
    <Card data-testid="card-lifecycle-metrics">
      <CardHeader>
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Mail className="h-4 w-4" />
          Lifecycle Email Metrics
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold" data-testid="text-total-emails">{metrics.total}</span>
          <span className="text-sm text-muted-foreground">total emails sent</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <h4 className="text-sm font-medium mb-2">By Type</h4>
            <div className="space-y-1">
              {Object.entries(metrics.byType).map(([type, count]) => (
                <div key={type} className="flex justify-between text-sm" data-testid={`metric-email-type-${type}`}>
                  <span className="text-muted-foreground">{typeLabels[type] || type}</span>
                  <span className="font-medium">{count}</span>
                </div>
              ))}
              {Object.keys(metrics.byType).length === 0 && (
                <p className="text-xs text-muted-foreground">No emails sent yet</p>
              )}
            </div>
          </div>

          <div>
            <h4 className="text-sm font-medium mb-2">By Segment</h4>
            <div className="space-y-1">
              {Object.entries(metrics.bySegment).map(([seg, count]) => (
                <div key={seg} className="flex justify-between text-sm" data-testid={`metric-email-segment-${seg}`}>
                  <span className="text-muted-foreground">{segmentLabels[seg] || seg}</span>
                  <span className="font-medium">{count}</span>
                </div>
              ))}
              {Object.keys(metrics.bySegment).length === 0 && (
                <p className="text-xs text-muted-foreground">No emails sent yet</p>
              )}
            </div>
          </div>
        </div>

        <div className="text-xs text-muted-foreground pt-2 border-t">
          Emails are sent via Resend. Worker runs every 6 hours for time-based emails (Day 7, Day 30). Stripe webhooks trigger payment and abandoned checkout emails.
        </div>
      </CardContent>
    </Card>
  );
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const QUICK_COMMANDS = [
  "How many active users do we have right now?",
  "What's the segment breakdown across our driver fleet?",
  "Check if compliance alerts need attention.",
  "Summarize our email engagement metrics.",
  "What 2026 tax law changes should I tell drivers about?",
];

function AICommandCenter() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = useCallback(async (messageText: string) => {
    if (!messageText.trim() || isStreaming) return;

    const trimmed = messageText.trim();
    const userMsg: ChatMessage = { role: "user", content: trimmed };

    const historySnapshot = [...messages, userMsg];
    setMessages(historySnapshot);
    setInput("");
    setIsStreaming(true);

    const withAssistant = [...historySnapshot, { role: "assistant" as const, content: "" }];
    setMessages(withAssistant);

    try {
      const response = await fetch("/api/admin/ai-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          message: trimmed,
          history: messages,
        }),
      });

      if (response.status === 403) {
        throw new Error("Access denied. Admin privileges required.");
      }
      if (!response.ok) {
        throw new Error("Failed to connect to AI assistant");
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) throw new Error("No response stream");

      let accumulated = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(trimmedLine.slice(6));
            if (data.done) continue;
            if (data.error) {
              toast({ title: "AI Error", description: data.error, variant: "destructive" });
              continue;
            }
            if (data.content) {
              accumulated += data.content;
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: "assistant", content: accumulated };
                return updated;
              });
            }
          } catch {}
        }
      }

      if (buffer.trim().startsWith("data: ")) {
        try {
          const data = JSON.parse(buffer.trim().slice(6));
          if (data.content) {
            accumulated += data.content;
            setMessages(prev => {
              const updated = [...prev];
              updated[updated.length - 1] = { role: "assistant", content: accumulated };
              return updated;
            });
          }
        } catch {}
      }
    } catch (error: any) {
      toast({ title: "Connection Error", description: error.message, variant: "destructive" });
      setMessages(historySnapshot);
    } finally {
      setIsStreaming(false);
    }
  }, [isStreaming, messages, toast]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <Card data-testid="card-ai-command-center" className="overflow-visible">
      <CardHeader>
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Bot className="h-4 w-4" />
          AI Command Center
          <Badge variant="secondary">
            <Sparkles className="h-3 w-3 mr-1" />
            Gemini
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Your MCTUSA Executive Assistant has real-time access to fleet metrics, segment data, and 2026 tax law context. Ask anything about your driver base, compliance status, or engagement.
        </p>

        {messages.length === 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Quick Commands</p>
            <div className="flex flex-wrap gap-2">
              {QUICK_COMMANDS.map((cmd, idx) => (
                <Button
                  key={idx}
                  variant="outline"
                  size="sm"
                  onClick={() => sendMessage(cmd)}
                  disabled={isStreaming}
                  data-testid={`button-quick-cmd-${idx}`}
                >
                  {cmd}
                </Button>
              ))}
            </div>
          </div>
        )}

        {messages.length > 0 && (
          <div
            ref={scrollRef}
            className="border rounded-md p-3 max-h-96 overflow-y-auto space-y-3"
            data-testid="container-chat-messages"
          >
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                data-testid={`chat-message-${msg.role}-${idx}`}
              >
                <div
                  className={`max-w-[85%] rounded-md px-3 py-2 text-sm whitespace-pre-wrap ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  }`}
                >
                  {msg.content || (isStreaming && idx === messages.length - 1 ? (
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Thinking...
                    </span>
                  ) : null)}
                </div>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask your Executive Assistant..."
            className="resize-none text-sm min-h-[40px] max-h-[80px]"
            disabled={isStreaming}
            data-testid="input-ai-chat"
          />
          <div className="flex flex-col gap-1">
            <Button
              type="submit"
              size="icon"
              disabled={!input.trim() || isStreaming}
              data-testid="button-send-ai-chat"
            >
              {isStreaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
            {messages.length > 0 && (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => setMessages([])}
                disabled={isStreaming}
                data-testid="button-clear-chat"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

interface QuarterlySub {
  id: number;
  userId: string;
  taxYear: number;
  quarter: number;
  jurisdiction: string;
  status: string;
  totalIncome: string;
  totalExpenses: string;
  netProfit: string;
  submittedAt: string | null;
  referenceId: string | null;
  createdAt: string;
}

interface QuarterlyOverview {
  total: number;
  pending: number;
  ready: number;
  submitted: number;
  submissions: QuarterlySub[];
}

function MTDQuarterlySection() {
  const { toast } = useToast();
  const { data: overview, isLoading } = useQuery<QuarterlyOverview>({
    queryKey: ["/api/admin/quarterly-overview"],
  });

  const statusColor = (s: string) => {
    if (s === "submitted") return "default";
    if (s === "ready") return "secondary";
    return "outline";
  };

  if (isLoading) return null;

  return (
    <Card data-testid="card-mtd-quarterly">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-primary" />
            <CardTitle className="text-sm font-medium">MTD Quarterly Submissions</CardTitle>
          </div>
          <div className="flex gap-2">
            <Badge variant="outline" data-testid="badge-quarterly-total">{overview?.total || 0} Total</Badge>
            <Badge variant="secondary" data-testid="badge-quarterly-ready">{overview?.ready || 0} Ready</Badge>
            <Badge data-testid="badge-quarterly-submitted">{overview?.submitted || 0} Filed</Badge>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          2026 Compliance: IRS Quarterly (1040-ES) &amp; UK Making Tax Digital. Auto-scan vault data per quarter.
        </p>
      </CardHeader>
      <CardContent>
        {overview && overview.submissions.length > 0 ? (
          <div className="space-y-2">
            <div className="grid grid-cols-7 text-xs font-medium text-muted-foreground border-b pb-2">
              <span>User</span>
              <span>Period</span>
              <span>Region</span>
              <span className="text-right">Income</span>
              <span className="text-right">Expenses</span>
              <span className="text-right">Net</span>
              <span className="text-center">Status</span>
            </div>
            {overview.submissions.slice(0, 20).map((sub) => (
              <div key={sub.id} className="grid grid-cols-7 text-sm items-center py-1.5 border-b border-muted/30" data-testid={`row-quarterly-${sub.id}`}>
                <span className="truncate text-xs font-mono">{sub.userId.slice(0, 8)}...</span>
                <span>Q{sub.quarter} {sub.taxYear}</span>
                <Badge variant="outline" className="w-fit text-xs">{sub.jurisdiction}</Badge>
                <span className="text-right">${Number(sub.totalIncome).toLocaleString()}</span>
                <span className="text-right text-destructive">${Number(sub.totalExpenses).toLocaleString()}</span>
                <span className="text-right font-medium">${Number(sub.netProfit).toLocaleString()}</span>
                <div className="text-center">
                  <Badge variant={statusColor(sub.status)} data-testid={`badge-status-${sub.id}`}>{sub.status}</Badge>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <CalendarClock className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No quarterly submissions yet</p>
            <p className="text-xs mt-1">Users can generate submissions from their dashboard quarterly filing section</p>
          </div>
        )}
        <div className="mt-4 p-3 rounded-lg bg-muted/50 text-xs text-muted-foreground">
          <div className="flex items-center gap-1 font-medium mb-1">
            <Shield className="h-3 w-3" /> API Integration Status
          </div>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3 text-yellow-500" />
              <span>HMRC MTD: Awaiting credentials</span>
            </div>
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3 text-yellow-500" />
              <span>IRS Direct: Awaiting API access</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface EInvoiceItem {
  id: number;
  userId: string;
  vaultEmail: string;
  senderEmail: string | null;
  senderName: string | null;
  invoiceNumber: string | null;
  amount: string | null;
  currency: string;
  description: string | null;
  status: string;
  linkedExpenseId: number | null;
  createdAt: string;
}

interface EInvoiceOverview {
  total: number;
  pending: number;
  received: number;
  approved: number;
  invoices: EInvoiceItem[];
}

function EInvoiceSection() {
  const { data: overview, isLoading } = useQuery<EInvoiceOverview>({
    queryKey: ["/api/admin/e-invoices-overview"],
  });

  if (isLoading) return null;

  return (
    <Card data-testid="card-e-invoice">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Inbox className="h-5 w-5 text-primary" />
            <CardTitle className="text-sm font-medium">E-Invoice Bridge</CardTitle>
          </div>
          <div className="flex gap-2">
            <Badge variant="outline" data-testid="badge-einvoice-total">{overview?.total || 0} Total</Badge>
            <Badge variant="secondary" data-testid="badge-einvoice-received">{overview?.received || 0} Received</Badge>
            <Badge data-testid="badge-einvoice-approved">{overview?.approved || 0} Approved</Badge>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Structured E-Invoicing: vendors send digital invoices directly to user vault emails. 100% accurate — no OCR needed.
        </p>
      </CardHeader>
      <CardContent>
        {overview && overview.invoices.length > 0 ? (
          <div className="space-y-2">
            <div className="grid grid-cols-6 text-xs font-medium text-muted-foreground border-b pb-2">
              <span>Vault Email</span>
              <span>Sender</span>
              <span>Invoice #</span>
              <span className="text-right">Amount</span>
              <span className="text-center">Status</span>
              <span className="text-center">Linked</span>
            </div>
            {overview.invoices.slice(0, 20).map((inv) => (
              <div key={inv.id} className="grid grid-cols-6 text-sm items-center py-1.5 border-b border-muted/30" data-testid={`row-einvoice-${inv.id}`}>
                <span className="truncate text-xs font-mono">{inv.vaultEmail}</span>
                <span className="truncate text-xs">{inv.senderName || inv.senderEmail || "—"}</span>
                <span className="text-xs">{inv.invoiceNumber || "—"}</span>
                <span className="text-right">{inv.amount ? `${inv.currency} ${Number(inv.amount).toLocaleString()}` : "—"}</span>
                <div className="text-center">
                  <Badge variant={inv.status === "approved" ? "default" : inv.status === "received" ? "secondary" : "outline"}>
                    {inv.status}
                  </Badge>
                </div>
                <div className="text-center">
                  {inv.linkedExpenseId ? (
                    <CheckCircle className="h-4 w-4 text-green-500 mx-auto" />
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Inbox className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No e-invoices intercepted yet</p>
            <p className="text-xs mt-1">Each user gets a unique vault email (e.g. user123@vault.mctusa.com)</p>
          </div>
        )}
        <div className="mt-4 p-3 rounded-lg bg-muted/50 text-xs text-muted-foreground">
          <div className="flex items-center gap-1 font-medium mb-1">
            <Mail className="h-3 w-3" /> E-Invoice System
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
            <div className="flex items-center gap-1">
              <CheckCircle className="h-3 w-3 text-green-500" />
              <span>Vault Email Generation: Active</span>
            </div>
            <div className="flex items-center gap-1">
              <CheckCircle className="h-3 w-3 text-green-500" />
              <span>Manual Invoice Simulation: Active</span>
            </div>
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3 text-yellow-500" />
              <span>Inbound Email Parsing: Awaiting MX setup</span>
            </div>
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3 text-yellow-500" />
              <span>Peppol/ZUGFeRD: Awaiting integration</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface ReferralOverview {
  total: number;
  pending: number;
  converted: number;
  ghost: Array<{
    id: number;
    referrerId: string;
    referredEmail: string;
    referralCode: string;
    status: string;
    createdAt: string;
  }>;
  topReferrers: Array<{
    userId: string;
    total: number;
    converted: number;
    credits: number;
  }>;
}

interface ReferralSettings {
  doubleCreditActive: boolean;
}

function ReferralAdminSection() {
  const { toast } = useToast();

  const { data: overview } = useQuery<ReferralOverview>({
    queryKey: ["/api/admin/referrals"],
  });

  const { data: settings } = useQuery<ReferralSettings>({
    queryKey: ["/api/admin/referral-settings"],
  });

  const toggleMutation = useMutation({
    mutationFn: async (active: boolean) => {
      const res = await apiRequest("PATCH", "/api/admin/referral-settings", { doubleCreditActive: active });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/referral-settings"] });
      toast({ title: `Double Credit ${data.doubleCreditActive ? "Activated" : "Deactivated"}` });
    },
  });

  const isDouble = settings?.doubleCreditActive || false;

  return (
    <Card data-testid="card-referral-admin">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            <CardTitle className="text-sm font-medium">Driver Referral System</CardTitle>
          </div>
          <div className="flex gap-2">
            <Badge variant="outline" data-testid="badge-referrals-total">{overview?.total || 0} Total</Badge>
            <Badge variant="secondary" data-testid="badge-referrals-pending">{overview?.pending || 0} Ghost</Badge>
            <Badge data-testid="badge-referrals-converted">{overview?.converted || 0} Converted</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between p-3 rounded-lg border" data-testid="toggle-double-credit">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Double Credit Mode</span>
            <Badge variant={isDouble ? "default" : "outline"} className="text-xs">
              {isDouble ? "ACTIVE — 2x credits per conversion" : "Standard — 1x credit"}
            </Badge>
          </div>
          <Button
            size="sm"
            variant={isDouble ? "default" : "outline"}
            onClick={() => toggleMutation.mutate(!isDouble)}
            disabled={toggleMutation.isPending}
            data-testid="button-toggle-double-credit"
          >
            {isDouble ? <ToggleRight className="h-4 w-4 mr-1" /> : <ToggleLeft className="h-4 w-4 mr-1" />}
            {isDouble ? "On" : "Off"}
          </Button>
        </div>

        {overview && overview.ghost.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-2 flex items-center gap-1">
              <MessageCircle className="h-4 w-4" />
              Ghost Tracking — Pending Signups ({overview.ghost.length})
            </h4>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {overview.ghost.slice(0, 15).map((g) => (
                <div key={g.id} className="flex items-center justify-between text-sm p-2 rounded bg-muted/50" data-testid={`row-ghost-${g.id}`}>
                  <div>
                    <span className="font-mono text-xs">{g.referredEmail}</span>
                    <span className="text-xs text-muted-foreground ml-2">via {g.referralCode}</span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const msg = encodeURIComponent(
                        `Hey! You were invited to My Cab Tax USA — the app that tracks every mile and locks receipts in a 7-year vault. Join with code ${g.referralCode}: https://mycabtax.com/signup?ref=${g.referralCode}`
                      );
                      window.open(`https://wa.me/?text=${msg}`, "_blank");
                    }}
                    data-testid={`button-nudge-${g.id}`}
                  >
                    <MessageCircle className="h-3 w-3 mr-1" />
                    Nudge on WhatsApp
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {overview && overview.topReferrers.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-2">Top Referrers</h4>
            <div className="grid grid-cols-4 text-xs font-medium text-muted-foreground border-b pb-2">
              <span>User</span>
              <span className="text-right">Total</span>
              <span className="text-right">Converted</span>
              <span className="text-right">Credits</span>
            </div>
            {overview.topReferrers.map((r, i) => (
              <div key={i} className="grid grid-cols-4 text-sm py-1.5 border-b border-muted/30" data-testid={`row-top-referrer-${i}`}>
                <span className="truncate font-mono text-xs">{r.userId.slice(0, 10)}...</span>
                <span className="text-right">{r.total}</span>
                <span className="text-right">{r.converted}</span>
                <span className="text-right font-medium">{r.credits}</span>
              </div>
            ))}
          </div>
        )}

        {(!overview || (overview.ghost.length === 0 && overview.topReferrers.length === 0)) && (
          <div className="text-center py-6 text-muted-foreground">
            <UserPlus className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No referrals yet</p>
            <p className="text-xs mt-1">Users can share their referral codes from their dashboard</p>
          </div>
        )}

        <div className="p-3 rounded-lg bg-muted/50 text-xs text-muted-foreground">
          <div className="flex items-center gap-1 font-medium mb-1">
            <Shield className="h-3 w-3" /> Safety Net & Annual Reset
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
            <div className="flex items-center gap-1">
              <CheckCircle className="h-3 w-3 text-green-500" />
              <span>Safety Net: Active (daily check)</span>
            </div>
            <div className="flex items-center gap-1">
              <CheckCircle className="h-3 w-3 text-green-500" />
              <span>Annual Reset: Jan 1 (US) / Apr 6 (UK)</span>
            </div>
            <div className="flex items-center gap-1">
              <CheckCircle className="h-3 w-3 text-green-500" />
              <span>Tiers: Bronze (5+), Silver (10+), Gold (20+)</span>
            </div>
            <div className="flex items-center gap-1">
              {isDouble ? (
                <><CheckCircle className="h-3 w-3 text-green-500" /><span>Double Credit: Active</span></>
              ) : (
                <><Clock className="h-3 w-3 text-yellow-500" /><span>Double Credit: Inactive</span></>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface VipUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  vipLabel: string | null;
  subscriptionStatus: string | null;
  createdAt: string | null;
}

interface SearchedUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  subscriptionStatus: string | null;
  isVip: boolean | null;
  vipLabel: string | null;
  isVerified: boolean | null;
  userSegment: string | null;
  createdAt: string | null;
}

function VIPManagementSection() {
  const { toast } = useToast();
  const [searchEmail, setSearchEmail] = useState("");
  const [searchResults, setSearchResults] = useState<SearchedUser[]>([]);
  const [searching, setSearching] = useState(false);

  const { data: vipUsers, refetch: refetchVip } = useQuery<VipUser[]>({
    queryKey: ["/api/admin/vip-users"],
  });

  const handleSearch = async () => {
    if (!searchEmail.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(`/api/admin/users/search?email=${encodeURIComponent(searchEmail)}`);
      if (!res.ok) throw new Error("Search failed");
      const data = await res.json();
      setSearchResults(data);
    } catch (err: any) {
      toast({ title: "Search failed", description: err.message, variant: "destructive" });
    } finally {
      setSearching(false);
    }
  };

  const toggleVip = useMutation({
    mutationFn: async ({ userId, isVip, vipLabel }: { userId: string; isVip: boolean; vipLabel?: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/users/${userId}/vip`, { isVip, vipLabel });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/vip-users"] });
      toast({ title: data.isVip ? `VIP granted to ${data.email}` : `VIP revoked from ${data.email}` });
      if (searchEmail) handleSearch();
    },
    onError: (err: any) => {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Card data-testid="card-vip-management">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Crown className="h-5 w-5 text-yellow-500" />
          <CardTitle className="text-sm font-medium">VIP User Management</CardTitle>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Grant complimentary Pro access. VIP users bypass Stripe billing and show as "Founder's Circle" members. They are excluded from referral revenue reports.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by email..."
              value={searchEmail}
              onChange={(e) => setSearchEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="pl-9"
              data-testid="input-vip-search"
            />
          </div>
          <Button onClick={handleSearch} disabled={searching} data-testid="button-vip-search">
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
          </Button>
        </div>

        {searchResults.length > 0 && (
          <div className="space-y-1 border rounded-lg p-2">
            <h4 className="text-xs font-medium text-muted-foreground mb-2">Search Results</h4>
            {searchResults.map((u) => (
              <div key={u.id} className="flex items-center justify-between p-2 rounded hover:bg-muted/50" data-testid={`row-search-user-${u.id}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{u.email || "No email"}</span>
                    {u.isVip && <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/30 text-xs"><Crown className="h-3 w-3 mr-1" />VIP</Badge>}
                    <Badge variant="outline" className="text-xs">{u.subscriptionStatus || "basic"}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {u.firstName} {u.lastName} {u.userSegment ? `(${u.userSegment})` : ""}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant={u.isVip ? "outline" : "default"}
                  onClick={() => toggleVip.mutate({ userId: u.id, isVip: !u.isVip })}
                  disabled={toggleVip.isPending}
                  data-testid={`button-toggle-vip-${u.id}`}
                >
                  <Crown className="h-3 w-3 mr-1" />
                  {u.isVip ? "Revoke VIP" : "Grant VIP"}
                </Button>
              </div>
            ))}
          </div>
        )}

        {vipUsers && vipUsers.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-2 flex items-center gap-1">
              <Crown className="h-4 w-4 text-yellow-500" />
              Active VIP Members ({vipUsers.length})
            </h4>
            <div className="space-y-1">
              {vipUsers.map((u) => (
                <div key={u.id} className="flex items-center justify-between p-2 rounded-lg border" data-testid={`row-vip-${u.id}`}>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{u.email}</span>
                      <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/30 text-xs">{u.vipLabel || "Founder's Circle"}</Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">{u.firstName} {u.lastName}</span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => toggleVip.mutate({ userId: u.id, isVip: false })}
                    disabled={toggleVip.isPending}
                    data-testid={`button-revoke-vip-${u.id}`}
                  >
                    Revoke
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {(!vipUsers || vipUsers.length === 0) && searchResults.length === 0 && (
          <div className="text-center py-6 text-muted-foreground">
            <Crown className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No VIP members yet</p>
            <p className="text-xs mt-1">Search for a user by email and grant VIP status</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const COUNTRY_META: { code: string; name: string; flag: string; group: string }[] = [
  { code: "US", name: "United States", flag: "🇺🇸", group: "North America" },
  { code: "GB", name: "United Kingdom", flag: "🇬🇧", group: "United Kingdom" },
  { code: "CA", name: "Canada", flag: "🇨🇦", group: "North America" },
  { code: "MX", name: "Mexico", flag: "🇲🇽", group: "North America" },
  { code: "NO", name: "Norway", flag: "🇳🇴", group: "Scandinavia" },
  { code: "SE", name: "Sweden", flag: "🇸🇪", group: "Scandinavia" },
  { code: "DK", name: "Denmark", flag: "🇩🇰", group: "Scandinavia" },
  { code: "EU", name: "European Union", flag: "🇪🇺", group: "European Union" },
  { code: "MY", name: "Malaysia", flag: "🇲🇾", group: "East Asia" },
  { code: "CN", name: "China", flag: "🇨🇳", group: "East Asia" },
  { code: "ID", name: "Indonesia", flag: "🇮🇩", group: "East Asia" },
  { code: "BR", name: "Brazil", flag: "🇧🇷", group: "South America & Africa" },
  { code: "ZA", name: "South Africa", flag: "🇿🇦", group: "South America & Africa" },
  { code: "NG", name: "Nigeria", flag: "🇳🇬", group: "South America & Africa" },
];

function CountryRolloutSection() {
  const { toast } = useToast();

  const { data: rollout, isLoading: rolloutLoading } = useQuery<Record<string, boolean>>({
    queryKey: ["/api/admin/country-rollout"],
  });

  const { data: usersByCountry } = useQuery<Record<string, number>>({
    queryKey: ["/api/admin/users-by-country"],
  });

  const { data: waitlistStats } = useQuery<Record<string, { name: string; count: number }>>({
    queryKey: ["/api/admin/waitlist-stats"],
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ code, live }: { code: string; live: boolean }) => {
      const res = await apiRequest("PATCH", `/api/admin/country-rollout/${code}`, { live });
      return res.json();
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/country-rollout"] });
      toast({
        title: vars.live ? "Country enabled" : "Country hidden",
        description: `${COUNTRY_META.find((c) => c.code === vars.code)?.name} is now ${vars.live ? "live for all drivers" : "hidden (Coming Soon)"}`,
      });
    },
    onError: () => toast({ title: "Error", description: "Could not update country status", variant: "destructive" }),
  });

  const presetMutation = useMutation({
    mutationFn: async (preset: string) => {
      const res = await apiRequest("POST", "/api/admin/country-rollout/preset", { preset });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/country-rollout"] });
      toast({ title: "Preset applied", description: `${data.preset} applied — ${data.enabled.length} countries now live` });
    },
    onError: () => toast({ title: "Error", description: "Failed to apply preset", variant: "destructive" }),
  });

  const liveCount = rollout ? Object.values(rollout).filter(Boolean).length : 0;

  return (
    <Card data-testid="card-country-rollout">
      <CardHeader>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Globe className="h-4 w-4 text-primary" />
              Global Rollout Control
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              {liveCount}/{COUNTRY_META.length} countries live · Toggle per-country or use a preset
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              variant="outline"
              onClick={() => presetMutation.mutate("phase1")}
              disabled={presetMutation.isPending}
              className="text-xs gap-1.5 touch-manipulation"
              data-testid="button-preset-phase1"
            >
              <Rocket className="h-3.5 w-3.5" />
              Launch Phase 1
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => presetMutation.mutate("phase2")}
              disabled={presetMutation.isPending}
              className="text-xs gap-1.5 touch-manipulation"
              data-testid="button-preset-phase2"
            >
              <Rocket className="h-3.5 w-3.5" />
              Launch Phase 2
            </Button>
            <Button
              size="sm"
              onClick={() => presetMutation.mutate("global")}
              disabled={presetMutation.isPending}
              className="text-xs gap-1.5 touch-manipulation bg-green-600 hover:bg-green-700 text-white"
              data-testid="button-preset-global"
            >
              <Globe className="h-3.5 w-3.5" />
              Go Global
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {rolloutLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-1">
            {COUNTRY_META.map((country, i) => {
              const isLive = rollout?.[country.code] ?? (country.code === "US" || country.code === "GB");
              const driverCount = usersByCountry?.[country.code] ?? 0;
              const isPending = toggleMutation.isPending;

              const prevGroup = i > 0 ? COUNTRY_META[i - 1].group : null;
              const showGroupHeader = country.group !== prevGroup;

              return (
                <div key={country.code}>
                  {showGroupHeader && (
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest pt-3 pb-1 px-1">
                      {country.group}
                    </p>
                  )}
                  <div
                    className={`flex items-center justify-between gap-3 p-2.5 rounded-lg transition-colors ${
                      isLive ? "bg-green-50 dark:bg-green-950/20 border border-green-100 dark:border-green-900/30" : "bg-muted/20 border border-border/30"
                    }`}
                    data-testid={`row-country-${country.code}`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-xl leading-none">{country.flag}</span>
                      <div>
                        <p className="text-sm font-medium leading-tight">{country.name}</p>
                        <p className="text-xs text-muted-foreground leading-tight flex items-center gap-1">
                          <MapPin className="h-2.5 w-2.5" />
                          {driverCount} driver{driverCount !== 1 ? "s" : ""} signed up
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5 shrink-0">
                      {!isLive && (waitlistStats?.[country.code]?.count ?? 0) > 0 && (
                        <Badge variant="outline" className="text-[10px] px-2 py-0 no-default-active-elevate border-purple-300 text-purple-600 dark:border-purple-700 dark:text-purple-400" data-testid={`badge-waitlist-${country.code}`}>
                          {waitlistStats![country.code].count} waitlist
                        </Badge>
                      )}
                      <Badge
                        variant={isLive ? "default" : "secondary"}
                        className={`text-[10px] px-2 py-0 no-default-active-elevate ${isLive ? "bg-green-600 text-white" : ""}`}
                        data-testid={`badge-status-${country.code}`}
                      >
                        {isLive ? "Live" : "Coming Soon"}
                      </Badge>
                      <Switch
                        checked={isLive}
                        onCheckedChange={(checked) => toggleMutation.mutate({ code: country.code, live: checked })}
                        disabled={isPending}
                        aria-label={`Toggle ${country.name}`}
                        data-testid={`switch-country-${country.code}`}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <Separator className="my-4" />

        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" />
            Drivers & Waitlist by Country
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="table-users-by-country">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="text-left py-2 px-2 text-xs font-medium text-muted-foreground">Country</th>
                  <th className="text-right py-2 px-2 text-xs font-medium text-muted-foreground">Drivers</th>
                  <th className="text-right py-2 px-2 text-xs font-medium text-purple-500">Waitlist</th>
                  <th className="text-right py-2 px-2 text-xs font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {COUNTRY_META.map((country) => {
                  const dCount = usersByCountry?.[country.code] ?? 0;
                  const wCount = waitlistStats?.[country.code]?.count ?? 0;
                  const isLiveRow = rollout?.[country.code] ?? (country.code === "US" || country.code === "GB");
                  if (dCount === 0 && wCount === 0 && !isLiveRow) return null;
                  return (
                    <tr key={country.code} className="border-b border-border/20 hover:bg-muted/10" data-testid={`row-stats-${country.code}`}>
                      <td className="py-2 px-2">
                        <span className="mr-1.5">{country.flag}</span>
                        {country.name}
                      </td>
                      <td className="text-right py-2 px-2 font-mono font-semibold">{dCount}</td>
                      <td className="text-right py-2 px-2">
                        {wCount > 0 ? (
                          <span className="font-mono font-semibold text-purple-600 dark:text-purple-400">{wCount}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="text-right py-2 px-2">
                        <Badge variant={isLiveRow ? "default" : "secondary"} className={`text-[10px] no-default-active-elevate ${isLiveRow ? "bg-green-600 text-white" : ""}`}>
                          {isLiveRow ? "Live" : "Hidden"}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
                {(usersByCountry?.["UNKNOWN"] ?? 0) > 0 ? (
                  <tr className="border-b border-border/20">
                    <td className="py-2 px-2 text-muted-foreground">🌍 Unknown</td>
                    <td className="text-right py-2 px-2 font-mono">{usersByCountry!["UNKNOWN"]}</td>
                    <td className="text-right py-2 px-2 text-muted-foreground">—</td>
                    <td className="text-right py-2 px-2">—</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-4 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/30 text-xs text-blue-800 dark:text-blue-200 space-y-1">
          <p className="font-semibold">Rollout Presets:</p>
          <p>• <strong>Phase 1:</strong> US + UK only</p>
          <p>• <strong>Phase 2:</strong> + Canada, Mexico, Norway, Sweden, Denmark</p>
          <p>• <strong>Go Global:</strong> All 14 countries live simultaneously</p>
          <p className="text-blue-600 dark:text-blue-400 mt-1">Settings are saved to the database and persist across server restarts.</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminPage() {
  const { data: metrics, isLoading, error } = useQuery<AdminMetrics>({
    queryKey: ["/api/admin/metrics"],
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background" data-testid="admin-loading">
        <div className="text-muted-foreground">Loading metrics...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background" data-testid="admin-error">
        <div className="text-destructive">Failed to load admin metrics</div>
      </div>
    );
  }

  if (!metrics) return null;

  const cards = [
    { title: "Total Users", value: metrics.totalUsers, icon: Users, testId: "metric-total-users" },
    { title: "Pro Subscribers", value: metrics.proUsers, icon: DollarSign, testId: "metric-pro-users" },
    { title: "Verified Users", value: metrics.verifiedUsers, icon: Shield, testId: "metric-verified-users" },
    { title: "Taxes Filed", value: metrics.taxesFiled, icon: FileText, testId: "metric-taxes-filed" },
    { title: "Income Records", value: metrics.totalIncomeRecords, icon: DollarSign, testId: "metric-income-records" },
    { title: "Expense Records", value: metrics.totalExpenseRecords, icon: Receipt, testId: "metric-expense-records" },
    { title: "Mileage Logs", value: metrics.totalMileageLogs, icon: Car, testId: "metric-mileage-logs" },
    { title: "Audit Log Entries", value: metrics.auditLogEntries, icon: Activity, testId: "metric-audit-logs" },
  ];

  return (
    <div className="min-h-screen bg-background p-6" data-testid="admin-dashboard">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-admin-title">Admin Dashboard</h1>
            <p className="text-sm text-muted-foreground">Business metrics, email automation, and system health</p>
          </div>
          {metrics.activeComplianceAlerts > 0 && (
            <Badge variant="destructive" data-testid="badge-compliance-alerts">
              <AlertTriangle className="w-3 h-3 mr-1" />
              {metrics.activeComplianceAlerts} Active Alert{metrics.activeComplianceAlerts !== 1 ? "s" : ""}
            </Badge>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {cards.map((card) => (
            <Card key={card.testId} data-testid={card.testId}>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{card.title}</CardTitle>
                <card.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{card.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <LifecycleEmailSection />
          <Card data-testid="card-system-info">
            <CardHeader>
              <CardTitle className="text-sm font-medium">System Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tax Year</span>
                  <span className="font-medium">2026</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">IRS Mileage Rate</span>
                  <span className="font-medium">$0.725/mile</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">SE Tax Rate</span>
                  <span className="font-medium">15.3%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">SALT Cap</span>
                  <span className="font-medium">$40,000</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">1099-K Threshold</span>
                  <span className="font-medium">$20,000 / 200 tx</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tips Exemption</span>
                  <span className="font-medium">OBBBA Sec. 101</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <CountryRolloutSection />

        <AICommandCenter />

        <MTDQuarterlySection />

        <EInvoiceSection />

        <ReferralAdminSection />

        <VIPManagementSection />

        <EmailDomainSection />
      </div>
    </div>
  );
}
