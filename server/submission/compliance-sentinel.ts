import { db } from "../db";
import { complianceAlerts } from "@shared/schema";
import { desc, eq, and, gt } from "drizzle-orm";
import type Stripe from "stripe";

const IRS_KEYWORDS = [
  "Schedule C",
  "Schedule SE",
  "Mileage Rate",
  "1099-K",
  "1099-NEC",
  "Self-Employment Tax",
  "Gig Economy",
  "Rideshare",
  "Standard Mileage",
  "Business Use",
  "Home Office Deduction",
  "Quarterly Estimated",
  "Form 1040",
  "Independent Contractor",
];

const FEEDS = [
  {
    name: "IRS News Releases",
    url: "https://www.irs.gov/newsroom/rss/news-releases.xml",
    type: "rss",
  },
  {
    name: "IRS Tax Tips",
    url: "https://www.irs.gov/newsroom/rss/tax-tips.xml",
    type: "rss",
  },
  {
    name: "IRS e-News for Tax Professionals",
    url: "https://www.irs.gov/newsroom/rss/irs-news-for-tax-professionals.xml",
    type: "rss",
  },
];

interface FeedItem {
  title: string;
  description: string;
  link: string;
  pubDate: string;
}

function parseRSSItems(xml: string): FeedItem[] {
  const items: FeedItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const itemXml = match[1];
    const title = extractTag(itemXml, "title");
    const description = extractTag(itemXml, "description");
    const link = extractTag(itemXml, "link");
    const pubDate = extractTag(itemXml, "pubDate");

    if (title) {
      items.push({
        title: decodeEntities(title),
        description: decodeEntities(description || ""),
        link: link || "",
        pubDate: pubDate || new Date().toISOString(),
      });
    }
  }

  return items;
}

function extractTag(xml: string, tag: string): string | null {
  const cdataMatch = new RegExp(`<${tag}>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>`, "i").exec(xml);
  if (cdataMatch) return cdataMatch[1].trim();

  const simpleMatch = new RegExp(`<${tag}>(.*?)</${tag}>`, "is").exec(xml);
  if (simpleMatch) return simpleMatch[1].trim();

  return null;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]*>/g, "");
}

function matchesKeywords(text: string): string[] {
  const lower = text.toLowerCase();
  return IRS_KEYWORDS.filter(kw => lower.includes(kw.toLowerCase()));
}

async function fetchFeed(feed: { name: string; url: string }): Promise<FeedItem[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(feed.url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "MyCabTaxUSA-ComplianceSentinel/1.0",
      },
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.error(`[sentinel] Feed ${feed.name} returned ${response.status}`);
      return [];
    }

    const xml = await response.text();
    return parseRSSItems(xml);
  } catch (err) {
    console.error(`[sentinel] Error fetching ${feed.name}:`, err instanceof Error ? err.message : err);
    return [];
  }
}

async function isDuplicateAlert(sourceUrl: string): Promise<boolean> {
  const existing = await db
    .select({ id: complianceAlerts.id })
    .from(complianceAlerts)
    .where(eq(complianceAlerts.sourceUrl, sourceUrl))
    .limit(1);
  return existing.length > 0;
}

const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi",
  MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire",
  NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina",
  ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee",
  TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington",
  WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", DC: "District of Columbia",
};

let _knownNexusStates: Set<string> = new Set();

async function checkStripeNexus(): Promise<number> {
  let alertsCreated = 0;
  try {
    let stripe;
    try {
      const { getUncachableStripeClient } = await import("../stripeClient");
      stripe = await getUncachableStripeClient();
    } catch {
      if (process.env.STRIPE_SECRET_KEY) {
        const StripeSDK = (await import("stripe")).default;
        stripe = new StripeSDK(process.env.STRIPE_SECRET_KEY);
      } else {
        return 0;
      }
    }

    let settings: any;
    try {
      settings = await (stripe as any).tax.settings.retrieve();
    } catch {
      return 0;
    }

    if (settings.status !== "active") return 0;

    const registrations: any[] = [];
    let hasMore = true;
    let startingAfter: string | undefined;

    while (hasMore) {
      const params: any = { limit: 100, status: "active" };
      if (startingAfter) params.starting_after = startingAfter;
      const page = await (stripe as any).tax.registrations.list(params);
      registrations.push(...page.data);
      hasMore = page.has_more;
      if (page.data.length > 0) startingAfter = page.data[page.data.length - 1].id;
    }

    const activeStates = new Set<string>();
    for (const reg of registrations) {
      const state = reg.country_options?.us?.state;
      if (state) activeStates.add(state);
    }

    const activeStatesArr = Array.from(activeStates);
    for (const stateCode of activeStatesArr) {
      if (_knownNexusStates.has(stateCode)) continue;

      const stateName = STATE_NAMES[stateCode] || stateCode;
      const sourceUrl = `https://dashboard.stripe.com/tax/registrations`;

      const existing = await db
        .select({ id: complianceAlerts.id })
        .from(complianceAlerts)
        .where(
          and(
            eq(complianceAlerts.alertType, "nexus_detected"),
            eq(complianceAlerts.stateCode, stateCode),
          )
        )
        .limit(1);

      if (existing.length > 0) {
        _knownNexusStates.add(stateCode);
        continue;
      }

      await db.insert(complianceAlerts).values({
        alertType: "nexus_detected",
        severity: "critical",
        title: `Nexus Detected: ${stateName}`,
        description: `Stripe Tax has identified a tax nexus obligation in ${stateName} (${stateCode}). This means you have enough economic activity (drivers, transactions, or revenue) in this state that you may be legally required to collect and remit sales tax there. Review your Stripe Tax registrations and consult a tax professional.`,
        source: "stripe_tax_nexus",
        sourceUrl,
        stateCode,
        metadata: {
          detectedAt: new Date().toISOString(),
          registrationCount: registrations.length,
          activeStates: Array.from(activeStates),
        },
      });

      _knownNexusStates.add(stateCode);
      alertsCreated++;
      console.log(`[sentinel] Nexus alert created: ${stateName} (${stateCode})`);
    }

    _knownNexusStates = activeStates;

  } catch (err) {
    console.error("[sentinel] Nexus check error:", err instanceof Error ? err.message : err);
  }
  return alertsCreated;
}

export async function runSentinelScan(): Promise<{
  feedsScanned: number;
  itemsProcessed: number;
  alertsCreated: number;
  nexusAlertsCreated: number;
  errors: string[];
}> {
  let feedsScanned = 0;
  let itemsProcessed = 0;
  let alertsCreated = 0;
  let nexusAlertsCreated = 0;
  const errors: string[] = [];

  console.log("[sentinel] Starting compliance scan...");

  for (const feed of FEEDS) {
    try {
      const items = await fetchFeed(feed);
      feedsScanned++;

      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 30);

      for (const item of items) {
        itemsProcessed++;

        const pubDate = new Date(item.pubDate);
        if (pubDate < cutoff) continue;

        const fullText = `${item.title} ${item.description}`;
        const matchedKeywords = matchesKeywords(fullText);

        if (matchedKeywords.length === 0) continue;

        if (item.link && await isDuplicateAlert(item.link)) continue;

        const severity = matchedKeywords.length >= 3 ? "critical"
          : matchedKeywords.length >= 2 ? "warning"
          : "info";

        await db.insert(complianceAlerts).values({
          alertType: "regulatory_update",
          severity,
          title: `IRS Update: ${item.title.substring(0, 200)}`,
          description: `${item.description.substring(0, 500)}${item.description.length > 500 ? "..." : ""}`,
          source: feed.name,
          sourceUrl: item.link || null,
          metadata: {
            keywords: matchedKeywords,
            pubDate: item.pubDate,
            feedName: feed.name,
          },
        });

        alertsCreated++;
        console.log(`[sentinel] Alert created: ${item.title.substring(0, 80)}... (${matchedKeywords.join(", ")})`);
      }
    } catch (err) {
      const msg = `${feed.name}: ${err instanceof Error ? err.message : "Unknown error"}`;
      errors.push(msg);
      console.error(`[sentinel] Feed error:`, msg);
    }
  }

  try {
    nexusAlertsCreated = await checkStripeNexus();
  } catch (err) {
    errors.push(`Nexus check: ${err instanceof Error ? err.message : "Unknown error"}`);
  }

  console.log(`[sentinel] Scan complete: ${feedsScanned} feeds, ${itemsProcessed} items, ${alertsCreated} alerts, ${nexusAlertsCreated} nexus alerts`);
  return { feedsScanned, itemsProcessed, alertsCreated, nexusAlertsCreated, errors };
}

let sentinelInterval: NodeJS.Timeout | null = null;
let lastScanResult: {
  timestamp: Date;
  feedsScanned: number;
  itemsProcessed: number;
  alertsCreated: number;
  nexusAlertsCreated: number;
  errors: string[];
} | null = null;

export function startSentinel(intervalHours: number = 6): void {
  if (sentinelInterval) {
    console.log("[sentinel] Already running, skipping start");
    return;
  }

  console.log(`[sentinel] Starting compliance sentinel (every ${intervalHours}h)`);

  setTimeout(async () => {
    try {
      const result = await runSentinelScan();
      lastScanResult = { timestamp: new Date(), ...result };
    } catch (err) {
      console.error("[sentinel] Initial scan error:", err);
    }
  }, 30000);

  sentinelInterval = setInterval(async () => {
    try {
      const result = await runSentinelScan();
      lastScanResult = { timestamp: new Date(), ...result };
    } catch (err) {
      console.error("[sentinel] Periodic scan error:", err);
    }
  }, intervalHours * 60 * 60 * 1000);
}

export function stopSentinel(): void {
  if (sentinelInterval) {
    clearInterval(sentinelInterval);
    sentinelInterval = null;
    console.log("[sentinel] Stopped");
  }
}

export function getSentinelStatus(): {
  running: boolean;
  lastScan: typeof lastScanResult;
  feeds: { name: string; url: string }[];
  keywords: string[];
} {
  return {
    running: sentinelInterval !== null,
    lastScan: lastScanResult,
    feeds: FEEDS.map(f => ({ name: f.name, url: f.url })),
    keywords: IRS_KEYWORDS,
  };
}
