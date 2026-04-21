import { useState } from "react";
import { Layout } from "@/components/Layout";
import { useRegion } from "@/hooks/use-region";
import { useAuth } from "@/hooks/use-auth";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { REGION_DEFAULT_LANGUAGE } from "@/lib/i18n";
import i18n from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Globe, CheckCircle, Loader2, Send, Bot, User, RefreshCw, DollarSign, FileText, Calendar, Shield, AlertTriangle, Mail, Bell, Lock, Zap, Star, ArrowRight } from "lucide-react";

type CountryGroup = {
  label: string;
  countries: CountryDef[];
};

type CountryDef = {
  code: string;
  name: string;
  flag: string;
  currency: string;
  taxAuthority: string;
  taxSystem: string;
  filingDeadline: string;
  mainForm: string;
  vatRate: string;
  keyRules: string[];
  aiContext: string;
  dac7Alert?: boolean;
};

const COUNTRY_GROUPS: CountryGroup[] = [
  {
    label: "North America",
    countries: [
      {
        code: "US", name: "United States", flag: "🇺🇸", currency: "USD ($)",
        taxAuthority: "IRS", taxSystem: "IRS Schedule C / Self-Employment Tax",
        filingDeadline: "April 15", mainForm: "Schedule C", vatRate: "N/A (Sales Tax)",
        keyRules: [
          "15.3% Self-Employment Tax (Social Security + Medicare)",
          "Schedule C deductions: vehicle, phone, insurance, supplies",
          "Quarterly estimated tax payments (1040-ES) — Apr 15, Jun 16, Sep 15, Jan 15",
          "$20,000 / 200 transactions 1099-K threshold (2026)",
          "Standard mileage rate: 70¢/mile (2026 IRS rate)",
          "No Tax on Tips (OBBBA 2026) — tips excluded from income",
        ],
        aiContext: "US IRS tax rules for self-employed rideshare drivers, Schedule C, 1040-ES",
      },
      {
        code: "CA", name: "Canada", flag: "🇨🇦", currency: "CAD (CA$)",
        taxAuthority: "CRA", taxSystem: "CRA T2125 / GST-HST Registration",
        filingDeadline: "June 15", mainForm: "T2125", vatRate: "5% GST + HST",
        keyRules: [
          "Federal income tax: 15%–33% progressive brackets",
          "Provincial tax varies: Ontario 5.05–13.16%, BC 5.06–20.5%",
          "CPP contributions required on self-employment net income",
          "GST/HST registration mandatory if >CA$30,000 gross per year",
          "Vehicle: logbook method or 55¢/km (first 5,000km), 49¢ after",
          "T2125 (Business Income) must be filed with T1 General",
        ],
        aiContext: "Canada CRA self-employment tax rules for rideshare drivers, T2125, GST/HST",
      },
      {
        code: "MX", name: "Mexico", flag: "🇲🇽", currency: "MXN (MX$)",
        taxAuthority: "SAT", taxSystem: "ISR / IVA / RESICO Simplified Regime",
        filingDeadline: "April 30", mainForm: "DIOT / CFDI", vatRate: "16% IVA",
        keyRules: [
          "ISR (Income Tax): 1.5%–35% progressive brackets",
          "IVA (VAT): 16% on services; Uber/DiDi withhold and remit",
          "RESICO regime: simplified 1%–2.5% monthly flat rate",
          "SAT e-invoicing (CFDI) required for all transactions",
          "Monthly prepayments required via SAT portal",
          "Platforms withhold 2.1% ISR + 8% IVA at source",
        ],
        aiContext: "Mexico SAT tax rules for rideshare drivers, ISR, IVA, RESICO, CFDI",
      },
    ],
  },
  {
    label: "United Kingdom",
    countries: [
      {
        code: "GB", name: "United Kingdom", flag: "🇬🇧", currency: "GBP (£)",
        taxAuthority: "HMRC", taxSystem: "HMRC Self Assessment / Making Tax Digital",
        filingDeadline: "January 31", mainForm: "SA103S", vatRate: "20% VAT",
        keyRules: [
          "Income Tax: 20% Basic / 40% Higher / 45% Additional rate",
          "Class 2 NIC: £3.45/week; Class 4 NIC: 9% on profits £12,570–£50,270",
          "Trading Allowance: £1,000 tax-free — no receipts needed",
          "Making Tax Digital (MTD): quarterly digital submissions",
          "Mileage: 45p/mile first 10,000; 25p/mile thereafter",
          "Annual Investment Allowance: 100% of capital purchases deductible",
        ],
        aiContext: "UK HMRC self-assessment and Making Tax Digital for rideshare drivers",
      },
    ],
  },
  {
    label: "Scandinavia",
    countries: [
      {
        code: "NO", name: "Norway", flag: "🇳🇴", currency: "NOK (kr)",
        taxAuthority: "Skatteetaten", taxSystem: "Norwegian Income Tax System",
        filingDeadline: "April 30", mainForm: "RF-1030", vatRate: "25% MVA",
        keyRules: [
          "Income Tax: 22% flat + Bracket Tax 1.7%–17.6% (2026)",
          "Personal deduction (personfradrag): NOK 88,250",
          "25% MVA (VAT) — registration required above NOK 50,000",
          "Minimum deduction (minstefradrag): 46% of income, max NOK 104,450",
          "Self-employed must file RF-1030 Self-Employment Schedule",
          "Mileage deduction: NOK 4.00/km",
        ],
        aiContext: "Norway Skatteetaten income tax, MVA VAT for rideshare/taxi drivers",
      },
      {
        code: "SE", name: "Sweden", flag: "🇸🇪", currency: "SEK (kr)",
        taxAuthority: "Skatteverket", taxSystem: "Swedish Preliminary Tax / F-skatt",
        filingDeadline: "May 2", mainForm: "NE-bilaga", vatRate: "25% MOMS",
        keyRules: [
          "Municipal income tax: ~32% average; State tax 20% above SEK 598,500",
          "F-skatt (preliminary tax) must be registered for self-employment",
          "25% MOMS (VAT) on transport; register above SEK 120,000 turnover",
          "Car deduction: SEK 18.50/km (own vehicle) for business trips",
          "NE-bilaga (Self-Employment Schedule) filed with income tax return",
          "Arbetsgivaravgifter (social contributions): 28.97% on net profit",
        ],
        aiContext: "Sweden Skatteverket F-skatt, MOMS, NE-bilaga for rideshare drivers",
      },
      {
        code: "DK", name: "Denmark", flag: "🇩🇰", currency: "DKK (kr)",
        taxAuthority: "Skat", taxSystem: "Danish Preliminary Income Assessment",
        filingDeadline: "July 1", mainForm: "Selvangivelse", vatRate: "25% MOMS",
        keyRules: [
          "Income Tax: ~37% municipal + 15% top bracket above DKK 568,900",
          "AM-bidrag (labour market contribution): 8% of gross income",
          "25% MOMS; registration required above DKK 50,000 turnover",
          "Personal allowance: DKK 49,700 (2026)",
          "Mileage deduction: DKK 2.23/km (2026) up to 20,000 km",
          "Platform economy: Skat monitors digital platform earnings via DAC7",
        ],
        aiContext: "Denmark Skat income tax, MOMS, DAC7 reporting for rideshare drivers",
      },
    ],
  },
  {
    label: "European Union",
    countries: [
      {
        code: "EU", name: "European Union", flag: "🇪🇺", currency: "EUR (€)",
        taxAuthority: "Local Authority", taxSystem: "EU Unified / DAC7 Digital Reporting",
        filingDeadline: "Varies by country", mainForm: "Country-specific", vatRate: "17–27% VAT",
        dac7Alert: true,
        keyRules: [
          "DAC7 Directive: platforms must report earnings ≥€2,000 OR 30+ transactions",
          "VAT varies: Ireland 23%, Germany 19%, France 20%, Italy 22%",
          "Self-employment registration required in most EU states",
          "Cross-border gig work may trigger multiple VAT obligations",
          "Digital platforms (Uber EU) now mandatory DAC7 reporters from 2023",
          "Each EU state has its own income tax brackets — check local rules",
        ],
        aiContext: "EU DAC7 digital platform reporting, VAT obligations for rideshare drivers across EU member states",
      },
    ],
  },
  {
    label: "East Asia",
    countries: [
      {
        code: "MY", name: "Malaysia", flag: "🇲🇾", currency: "MYR (RM)",
        taxAuthority: "LHDN / IRB", taxSystem: "Malaysian Income Tax / Gig Workers Act 2026",
        filingDeadline: "April 30", mainForm: "B Form / BE Form", vatRate: "6% SST",
        keyRules: [
          "Income Tax: 0%–30% graduated; exempt below RM 5,000",
          "2026 Gig Workers Act: SOCSO (PERKESO) contributions now mandatory",
          "SOCSO deduction: 1.25% employee + 1.75% employer (platform pays)",
          "Tax relief: RM 10,000 for approved lifestyle/transport expenses",
          "SST (Sales & Services Tax): 6% on digital services",
          "e-Invoice mandatory from 2024; eFile via MyTax portal",
        ],
        aiContext: "Malaysia LHDN income tax, Gig Workers Act 2026, SOCSO for rideshare/Grab drivers",
      },
      {
        code: "CN", name: "China", flag: "🇨🇳", currency: "CNY (¥)",
        taxAuthority: "国家税务总局 (SAT China)", taxSystem: "IIT / 2026 New VAT Law",
        filingDeadline: "March 31", mainForm: "综合所得年度汇算", vatRate: "3% simplified",
        keyRules: [
          "2026 New VAT Law: 3% simplified rate for transport/delivery services",
          "Individual Income Tax (IIT): 3%–45% progressive brackets",
          "Basic deduction: RMB 60,000 annually (RMB 5,000/month)",
          "Additional deductions: education, healthcare, housing loan interest",
          "Platform operators must withhold IIT at source",
          "Golden Tax System: all invoices tracked digitally (Fapiao e-invoice)",
        ],
        aiContext: "China SAT individual income tax, 2026 New VAT Law, IIT for rideshare/DiDi drivers",
      },
      {
        code: "ID", name: "Indonesia", flag: "🇮🇩", currency: "IDR (Rp)",
        taxAuthority: "DJP (Ditjen Pajak)", taxSystem: "PPh 21 / Economic Stimulus 2026",
        filingDeadline: "March 31", mainForm: "SPT Tahunan 1770", vatRate: "12% PPN",
        keyRules: [
          "2026 Economic Stimulus: PPh 21 exemption for earnings ≤IDR 10m/month",
          "Income Tax (PPh 21): 5%–35% progressive brackets",
          "PTKP (non-taxable threshold): IDR 54m/year (single)",
          "PPN (VAT): 12% from 2025; app-based transport partially exempt",
          "Final Tax option for UMKM: 0.5% of gross turnover if ≤IDR 500m",
          "NPWP (Tax ID) required to avoid 20% surcharge on withholding",
        ],
        aiContext: "Indonesia DJP income tax PPh 21, 2026 stimulus, PPN for Gojek/Grab drivers",
      },
    ],
  },
  {
    label: "South America & Africa",
    countries: [
      {
        code: "BR", name: "Brazil", flag: "🇧🇷", currency: "BRL (R$)",
        taxAuthority: "Receita Federal", taxSystem: "IRPF / Digital Withholding 2026",
        filingDeadline: "April 30", mainForm: "DIRPF", vatRate: "Multiple (ICMS/ISS/PIS)",
        keyRules: [
          "2026 Digital Withholding: Uber, iFood, 99 withhold 1.5% IRRF at source",
          "IRPF: 0%–27.5% progressive brackets; exempt below R$ 28,559/year",
          "MEI (microentrepreneur) regime: flat INSS + ISS + ICMS monthly",
          "Deductible expenses: vehicle depreciation, fuel, maintenance, app fees",
          "INSS contributions: 11% up to salary ceiling",
          "Annual return (DIRPF) mandatory if gross income >R$ 30,639/year",
        ],
        aiContext: "Brazil Receita Federal IRPF, digital withholding 2026, MEI for rideshare/iFood drivers",
      },
      {
        code: "ZA", name: "South Africa", flag: "🇿🇦", currency: "ZAR (R)",
        taxAuthority: "SARS", taxSystem: "SARS Provisional Tax / Turnover Tax",
        filingDeadline: "October 31", mainForm: "ITR12", vatRate: "15% VAT",
        keyRules: [
          "Income Tax: 18%–45% progressive; exempt below R$ 95,750 (2026)",
          "Provisional Tax: 2 payments (Aug 31 + Feb 28) + optional 3rd",
          "Turnover Tax: option for SMEs with turnover ≤R$ 1m (0%–3%)",
          "15% VAT registration required above R$ 1m annual turnover",
          "Mileage: SARS rate for business travel",
          "Uber/Bolt required to issue IRP5 for earnings to drivers in SA",
        ],
        aiContext: "South Africa SARS income tax, provisional tax, VAT for Uber/Bolt drivers",
      },
      {
        code: "NG", name: "Nigeria", flag: "🇳🇬", currency: "NGN (₦)",
        taxAuthority: "FIRS / LIRS", taxSystem: "PITA / Turnover Tax 2026",
        filingDeadline: "March 31", mainForm: "ITAS Return", vatRate: "7.5% VAT",
        keyRules: [
          "Personal Income Tax Act (PITA): 7%–24% progressive",
          "Consolidated Relief Allowance: 20% of income + ₦200,000",
          "7.5% VAT on services; Bolt/Uber as digital services may apply",
          "2026 Finance Act: digital economy operators must withhold 5%",
          "FIRS ITAS: file online via taxpromax.gov.ng",
          "State-level taxes apply (Lagos LIRS, Abuja FCT) in addition to federal",
        ],
        aiContext: "Nigeria FIRS/LIRS personal income tax, VAT, digital economy withholding for rideshare drivers",
      },
    ],
  },
];

const ALL_COUNTRIES = COUNTRY_GROUPS.flatMap((g) => g.countries);

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

function ComingSoonCard({ country }: { country: CountryDef }) {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const waitlistMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/waitlist", {
        email,
        countryCode: country.code,
        countryName: country.name,
        source: "global_tax_page",
      });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.alreadyRegistered) {
        toast({ title: "Already registered!", description: `${email} is already on the waitlist for ${country.name}.` });
      } else {
        setSubmitted(true);
      }
    },
    onError: () => toast({ title: "Error", description: "Couldn't save your email. Please try again.", variant: "destructive" }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !email.includes("@")) return;
    waitlistMutation.mutate();
  };

  const perks = [
    { icon: Zap, text: "AI calibrated for your local 2026 tax laws" },
    { icon: Shield, text: "IRS / local authority compliance built-in" },
    { icon: Star, text: "Priority access before public launch" },
    { icon: Bell, text: "Instant notification when we go live" },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4" data-testid="coming-soon-section">
      <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-slate-900 via-purple-950 to-slate-900 text-white shadow-2xl">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-4 right-4 text-9xl leading-none select-none">{country.flag}</div>
          <div className="absolute -bottom-8 -left-8 w-48 h-48 rounded-full bg-purple-500 blur-3xl" />
          <div className="absolute -top-4 right-12 w-32 h-32 rounded-full bg-blue-500 blur-3xl" />
        </div>
        <CardContent className="relative z-10 p-8 space-y-6">
          <div className="space-y-3">
            <Badge className="bg-purple-500/20 text-purple-300 border border-purple-500/30 text-xs px-3 py-1 no-default-active-elevate">
              <Lock className="h-3 w-3 mr-1.5 inline" />
              Coming Soon — Priority Access
            </Badge>
            <div className="flex items-start gap-3">
              <span className="text-4xl leading-none">{country.flag}</span>
              <div>
                <h2 className="text-2xl font-bold text-white leading-tight">{country.name}</h2>
                <p className="text-sm text-purple-200 mt-0.5">{country.taxAuthority} · {country.currency}</p>
              </div>
            </div>
            <p className="text-sm text-slate-300 leading-relaxed">
              We are calibrating our AI for your local{" "}
              <span className="text-white font-semibold">2026 {country.name} tax laws</span>.
              Join the waitlist for priority access before we launch to the public.
            </p>
          </div>

          <div className="space-y-2.5">
            {perks.map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-2.5">
                <div className="w-6 h-6 rounded-full bg-purple-500/30 flex items-center justify-center shrink-0">
                  <Icon className="h-3 w-3 text-purple-300" />
                </div>
                <span className="text-sm text-slate-200">{text}</span>
              </div>
            ))}
          </div>

          {submitted ? (
            <div className="flex items-center gap-3 p-4 rounded-xl bg-green-500/20 border border-green-500/30">
              <CheckCircle className="h-5 w-5 text-green-400 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-green-300">You're on the list!</p>
                <p className="text-xs text-green-400/80 mt-0.5">We'll email you the moment {country.name} goes live.</p>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    required
                    className="pl-9 bg-white/10 border-white/20 text-white placeholder:text-slate-400 focus:border-purple-400 focus:ring-purple-400/30 h-11"
                    data-testid="input-waitlist-email"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={!email.trim() || !email.includes("@") || waitlistMutation.isPending}
                  className="h-11 px-4 bg-purple-600 hover:bg-purple-500 text-white border-0 shrink-0 touch-manipulation"
                  data-testid="button-waitlist-submit"
                >
                  {waitlistMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>Join <ArrowRight className="h-4 w-4 ml-1.5" /></>
                  )}
                </Button>
              </div>
              <p className="text-[11px] text-slate-400 text-center">
                No spam. Unsubscribe anytime. Launch notification only.
              </p>
            </form>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            What's Coming for {country.name}
          </CardTitle>
          <p className="text-xs text-muted-foreground">Our AI is being trained on these specific rules:</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="space-y-2.5">
            {country.keyRules.map((rule, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-[10px] font-semibold text-muted-foreground">{i + 1}</span>
                </div>
                <span className="text-muted-foreground">{rule}</span>
              </li>
            ))}
          </ul>
          <Separator />
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2.5 rounded-lg bg-muted/30 border border-border/30">
              <p className="text-muted-foreground">Tax Authority</p>
              <p className="font-semibold mt-0.5">{country.taxAuthority}</p>
            </div>
            <div className="p-2.5 rounded-lg bg-muted/30 border border-border/30">
              <p className="text-muted-foreground">Filing Deadline</p>
              <p className="font-semibold mt-0.5">{country.filingDeadline}</p>
            </div>
            <div className="p-2.5 rounded-lg bg-muted/30 border border-border/30">
              <p className="text-muted-foreground">Currency</p>
              <p className="font-semibold mt-0.5">{country.currency}</p>
            </div>
            <div className="p-2.5 rounded-lg bg-muted/30 border border-border/30">
              <p className="text-muted-foreground">VAT / Sales Tax</p>
              <p className="font-semibold mt-0.5">{country.vatRate}</p>
            </div>
          </div>
          <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30 flex items-start gap-2">
            <Bell className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700 dark:text-amber-300">
              <span className="font-semibold">Early access perk:</span> Waitlist members get 3 months free Pro when we launch in {country.name}.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function AiTaxAssistant({ country }: { country: CountryDef }) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: `Hello! I'm your ${country.name} ${country.flag} tax assistant. I specialise in ${country.aiContext}. What would you like to know?`,
    },
  ]);
  const [input, setInput] = useState("");

  const { data: taxData } = useQuery<any>({
    queryKey: ["/api/tax/summary"],
    staleTime: 1000 * 60 * 5,
  });

  const chatMutation = useMutation({
    mutationFn: async (question: string) => {
      const res = await apiRequest("POST", "/api/global-tax-assistant", {
        question,
        countryCode: country.code,
        countryContext: country.aiContext,
        userTaxData: taxData || null,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setMessages((prev) => [...prev, { role: "assistant", content: data.answer }]);
    },
    onError: () => {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, I couldn't get an answer right now. Please try again." },
      ]);
    },
  });

  const handleSend = () => {
    if (!input.trim() || chatMutation.isPending) return;
    const question = input.trim();
    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setInput("");
    chatMutation.mutate(question);
  };

  const quickQuestions = [
    `What expenses can I deduct as a ${country.name} rideshare driver?`,
    `How do I calculate my tax payments in ${country.name}?`,
    `What mileage rate applies in ${country.name} for 2026?`,
    country.dac7Alert ? "How does DAC7 reporting affect me?" : `Do I need to register for ${country.vatRate.split(" ")[0]} in ${country.name}?`,
  ];

  return (
    <div className="space-y-4">
      <div className="h-72 overflow-y-auto space-y-3 p-3 rounded-lg bg-muted/20 border border-border/50" data-testid="div-chat-messages">
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
            <div className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400"}`}>
              {msg.role === "user" ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
            </div>
            <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed whitespace-pre-line ${msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-background border border-border/50 text-foreground"}`}>
              {msg.content}
            </div>
          </div>
        ))}
        {chatMutation.isPending && (
          <div className="flex gap-2">
            <div className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center bg-blue-100 dark:bg-blue-900/50">
              <Bot className="h-3.5 w-3.5 text-blue-600" />
            </div>
            <div className="bg-background border border-border/50 rounded-lg px-3 py-2">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {quickQuestions.map((q, i) => (
          <button
            key={i}
            onClick={() => {
              if (chatMutation.isPending) return;
              setMessages((prev) => [...prev, { role: "user", content: q }]);
              chatMutation.mutate(q);
            }}
            disabled={chatMutation.isPending}
            className="text-xs px-3 py-1.5 rounded-full border border-border/60 bg-background hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 text-left touch-manipulation"
            data-testid={`button-quick-q-${i}`}
          >
            {q}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder={`Ask about ${country.name} tax rules...`}
          className="min-h-[44px] max-h-24 resize-none text-sm"
          rows={1}
          data-testid="input-tax-question"
        />
        <Button
          onClick={handleSend}
          disabled={!input.trim() || chatMutation.isPending}
          size="icon"
          className="shrink-0 h-11 w-11 touch-manipulation"
          data-testid="button-send-question"
        >
          {chatMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}

export default function GlobalTaxPage() {
  const { region, switchRegion, isSwitching, detectedCountry } = useRegion();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [selectedCode, setSelectedCode] = useState<string>(detectedCountry || "US");

  const { data: rolloutStatus } = useQuery<Record<string, boolean>>({
    queryKey: ["/api/country-rollout"],
    staleTime: 1000 * 60 * 5,
  });

  const activeCountry = ALL_COUNTRIES.find((c) => c.code === selectedCode) || ALL_COUNTRIES[0];

  const isCountryLive = (code: string): boolean => {
    if (!rolloutStatus) return code === "US" || code === "GB";
    return rolloutStatus[code] ?? (code === "US" || code === "GB");
  };

  const handleSwitchRegion = (code: string) => {
    switchRegion(code);
    const lang = REGION_DEFAULT_LANGUAGE[code];
    if (lang) i18n.changeLanguage(lang);
    toast({
      title: "Region Updated",
      description: `Switched to ${ALL_COUNTRIES.find((c) => c.code === code)?.name || code}. Language and currency updated.`,
    });
  };

  const isCurrentRegion = (code: string) => {
    const regionToCode: Record<string, string> = {
      US: "US", UK: "GB", CA: "CA", MX: "MX",
      NO: "NO", SE: "SE", DK: "DK", EU: "EU",
      MY: "MY", CN: "CN", ID: "ID", BR: "BR", ZA: "ZA", NG: "NG",
    };
    return regionToCode[region] === code;
  };

  return (
    <Layout>
      <div className="flex flex-col gap-1 mb-4">
        <h1 className="text-2xl font-semibold flex items-center gap-2" data-testid="text-global-tax-title">
          <Globe className="h-6 w-6 text-primary" />
          Global Tax Centre
        </h1>
        <p className="text-sm text-muted-foreground">
          Select your country to view 2026 tax rules, rates, and get AI-powered guidance in your local language.
        </p>
      </div>

      <div className="space-y-4">
        {COUNTRY_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2 px-1">{group.label}</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {group.countries.map((country) => {
                const isActive = selectedCode === country.code;
                const isCurrent = isCurrentRegion(country.code);
                const live = isCountryLive(country.code);
                return (
                  <button
                    key={country.code}
                    onClick={() => setSelectedCode(country.code)}
                    className={`relative flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all touch-manipulation min-h-[80px] ${
                      isActive
                        ? "border-primary bg-primary/5 shadow-md"
                        : live
                        ? "border-border/40 bg-card hover:border-primary/30 hover:bg-muted/20"
                        : "border-border/20 bg-muted/10 opacity-75 hover:opacity-90 hover:border-purple-300/40"
                    }`}
                    data-testid={`button-country-${country.code}`}
                  >
                    {isCurrent && (
                      <Badge className="absolute -top-2 -right-2 text-[9px] px-1.5 py-0 no-default-active-elevate" variant="default">
                        Active
                      </Badge>
                    )}
                    {country.dac7Alert && live && (
                      <Badge className="absolute -top-2 -left-2 text-[9px] px-1.5 py-0 no-default-active-elevate bg-amber-500 text-white border-0">
                        DAC7
                      </Badge>
                    )}
                    {!live && !isCurrent && (
                      <Badge className="absolute -top-2 -left-2 text-[9px] px-1.5 py-0 no-default-active-elevate bg-purple-600 text-white border-0">
                        Soon
                      </Badge>
                    )}
                    <span className={`text-2xl leading-none ${!live ? "grayscale opacity-60" : ""}`}>{country.flag}</span>
                    <span className="text-xs font-medium text-center leading-tight">{country.name}</span>
                    <span className="text-[10px] text-muted-foreground leading-tight">{live ? country.currency : "Coming Soon"}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {!isCountryLive(activeCountry.code) ? (
        <ComingSoonCard country={activeCountry} />
      ) : (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        <Card data-testid="card-tax-rules">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-base flex items-center gap-2">
                <span className="text-2xl">{activeCountry.flag}</span>
                {activeCountry.name} — 2026 Tax Rules
              </CardTitle>
              <Button
                size="sm"
                variant={isCurrentRegion(activeCountry.code) ? "secondary" : "default"}
                onClick={() => handleSwitchRegion(activeCountry.code)}
                disabled={isSwitching}
                className="shrink-0 touch-manipulation"
                data-testid="button-apply-region"
              >
                {isSwitching ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
                Use {activeCountry.name}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{activeCountry.taxSystem}</p>
          </CardHeader>
          <CardContent className="space-y-4">
            {activeCountry.dac7Alert && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">DAC7 Compliance Required</p>
                  <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                    EU DAC7 Directive requires platforms to report your earnings to tax authorities if you earn ≥€2,000 <strong>or</strong> complete 30+ transactions per year. Your data is automatically shared with your national tax authority.
                  </p>
                </div>
              </div>
            )}

            <ul className="space-y-2">
              {activeCountry.keyRules.map((rule, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-green-500 dark:text-green-400 shrink-0 mt-0.5" />
                  <span>{rule}</span>
                </li>
              ))}
            </ul>

            <Separator />

            <div className="grid grid-cols-2 gap-2">
              <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/30">
                <DollarSign className="h-4 w-4 text-blue-600 dark:text-blue-400 mb-1" />
                <p className="text-xs text-muted-foreground">Currency</p>
                <p className="text-sm font-semibold leading-tight">{activeCountry.currency}</p>
              </div>
              <div className="p-3 rounded-lg bg-purple-50 dark:bg-purple-950/20 border border-purple-100 dark:border-purple-900/30">
                <Shield className="h-4 w-4 text-purple-600 dark:text-purple-400 mb-1" />
                <p className="text-xs text-muted-foreground">Tax Authority</p>
                <p className="text-sm font-semibold leading-tight">{activeCountry.taxAuthority}</p>
              </div>
              <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-100 dark:border-green-900/30">
                <Calendar className="h-4 w-4 text-green-600 dark:text-green-400 mb-1" />
                <p className="text-xs text-muted-foreground">Filing Deadline</p>
                <p className="text-sm font-semibold leading-tight">{activeCountry.filingDeadline}</p>
              </div>
              <div className="p-3 rounded-lg bg-orange-50 dark:bg-orange-950/20 border border-orange-100 dark:border-orange-900/30">
                <FileText className="h-4 w-4 text-orange-600 dark:text-orange-400 mb-1" />
                <p className="text-xs text-muted-foreground">Main Form</p>
                <p className="text-sm font-semibold leading-tight">{activeCountry.mainForm}</p>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-muted/30 border border-border/40">
              <p className="text-xs text-muted-foreground mb-1 font-medium">VAT / Sales Tax</p>
              <p className="text-sm font-semibold">{activeCountry.vatRate}</p>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-ai-assistant">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Bot className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              AI Tax Assistant — {activeCountry.flag} {activeCountry.name}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Powered by Gemini AI. Knows {activeCountry.name} 2026 tax laws. Answers in your language.
            </p>
          </CardHeader>
          <CardContent>
            <AiTaxAssistant key={activeCountry.code} country={activeCountry} />
          </CardContent>
        </Card>
      </div>
      )}
    </Layout>
  );
}
