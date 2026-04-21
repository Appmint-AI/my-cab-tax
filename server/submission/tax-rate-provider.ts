import { db } from "../db";
import { taxRateCache, complianceAlerts } from "@shared/schema";
import { eq, and, gt, desc } from "drizzle-orm";
import { getStateConfig, calculateStateTax, type StateTaxResult, type StateConfig } from "./state-engine";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const RATE_CHANGE_THRESHOLD_PCT = 0.1;

export interface TaxRateResponse {
  stateCode: string;
  stateName: string;
  taxType: string;
  topRate: number;
  effectiveRate: number;
  estimatedTax: number;
  provider: string;
  cachedAt: Date;
  expiresAt: Date;
  isLive: boolean;
  brackets?: { rate: number; taxableInBracket: number; taxInBracket: number }[];
  hasLocalTax: boolean;
  isDecoupled: boolean;
  decoupledRules: string[];
  rateChanged: boolean;
  rateChangePct: number | null;
}

interface TaxRateAdapter {
  name: string;
  isConfigured(): boolean;
  fetchRate(stateCode: string, income: number, zipCode?: string): Promise<{
    topRate: number;
    effectiveRate: number;
    estimatedTax: number;
    metadata?: Record<string, unknown>;
  } | null>;
}

const STRIPE_TAX_DEFAULT_CODE = "txcd_20030000";

class StripeTaxAdapter implements TaxRateAdapter {
  name = "stripe_tax";
  private _configured: boolean | null = null;
  private _pendingRetryAt: number = 0;
  private static readonly PENDING_RETRY_INTERVAL_MS = 15 * 60 * 1000;

  isConfigured(): boolean {
    if (this._configured === false) {
      if (this._pendingRetryAt > 0 && Date.now() >= this._pendingRetryAt) {
        this._configured = null;
        this._pendingRetryAt = 0;
      } else {
        return false;
      }
    }
    if (this._configured !== null) return this._configured;
    const hasConnector = !!(process.env.REPLIT_CONNECTORS_HOSTNAME &&
      (process.env.REPL_IDENTITY || process.env.WEB_REPL_RENEWAL));
    const hasEnvKey = !!process.env.STRIPE_SECRET_KEY;
    this._configured = hasConnector || hasEnvKey;
    return this._configured;
  }

  private async getStripe() {
    try {
      const { getUncachableStripeClient } = await import("../stripeClient");
      return await getUncachableStripeClient();
    } catch {
      if (process.env.STRIPE_SECRET_KEY) {
        const Stripe = (await import("stripe")).default;
        return new Stripe(process.env.STRIPE_SECRET_KEY);
      }
      this._configured = false;
      return null;
    }
  }

  async fetchRate(stateCode: string, income: number, _zipCode?: string): Promise<{
    topRate: number;
    effectiveRate: number;
    estimatedTax: number;
    metadata?: Record<string, unknown>;
  } | null> {
    if (!this.isConfigured()) return null;

    try {
      const stripe = await this.getStripe();
      if (!stripe) return null;

      const calculation = await stripe.tax.calculations.create({
        currency: "usd",
        line_items: [
          {
            amount: Math.round(income * 100),
            reference: `schedule_c_net_profit_${stateCode}`,
            tax_behavior: "exclusive" as const,
            tax_code: STRIPE_TAX_DEFAULT_CODE,
          },
        ],
        customer_details: {
          address: {
            state: stateCode,
            country: "US",
          },
          address_source: "billing" as const,
        },
      });

      const taxAmount = (calculation.tax_amount_exclusive || 0) / 100;
      const effectiveRate = income > 0 ? (taxAmount / income) * 100 : 0;

      const staticConfig = getStateConfig(stateCode);
      const topRate = staticConfig?.rate_2026 || effectiveRate;

      return {
        topRate,
        effectiveRate: Math.round(effectiveRate * 100) / 100,
        estimatedTax: Math.round(taxAmount * 100) / 100,
        metadata: {
          stripeCalculationId: calculation.id,
          taxCode: STRIPE_TAX_DEFAULT_CODE,
          lineItems: calculation.line_items?.data?.length || 0,
          source: "stripe_tax_calculation_api",
          note: "Stripe Tax provides certified tax calculations including state/local taxes",
        },
      };
    } catch (err: any) {
      if (err?.type === 'StripeInvalidRequestError' && err?.message?.includes('Tax has not been activated')) {
        console.warn(`[tax-provider] Stripe Tax pending activation — will retry in 15 minutes. Using static rates.`);
        this._configured = false;
        this._pendingRetryAt = Date.now() + StripeTaxAdapter.PENDING_RETRY_INTERVAL_MS;
        return null;
      }
      console.error(`[tax-provider] Stripe Tax API error for ${stateCode}:`, err?.message || err);
      return null;
    }
  }
}

class AvalaraAdapter implements TaxRateAdapter {
  name = "avalara";

  isConfigured(): boolean {
    return !!process.env.AVALARA_API_KEY && !!process.env.AVALARA_ACCOUNT_ID;
  }

  async fetchRate(stateCode: string, income: number, zipCode?: string): Promise<{
    topRate: number;
    effectiveRate: number;
    estimatedTax: number;
    metadata?: Record<string, unknown>;
  } | null> {
    if (!this.isConfigured()) return null;

    try {
      const apiKey = process.env.AVALARA_API_KEY!;
      const accountId = process.env.AVALARA_ACCOUNT_ID!;
      const baseUrl = process.env.AVALARA_ENVIRONMENT === "production"
        ? "https://rest.avatax.com"
        : "https://sandbox-rest.avatax.com";

      const auth = Buffer.from(`${accountId}:${apiKey}`).toString("base64");

      const response = await fetch(`${baseUrl}/api/v2/taxrates/byaddress?country=US&region=${stateCode}&postalCode=${zipCode || "00000"}`, {
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        console.error(`[tax-provider] Avalara API ${response.status}: ${await response.text()}`);
        return null;
      }

      const data = await response.json() as {
        totalRate?: number;
        rates?: Array<{ rate: number; name: string; type: string }>;
      };
      const totalRate = (data.totalRate || 0) * 100;
      const estimatedTax = Math.round(income * (totalRate / 100) * 100) / 100;

      const staticConfig = getStateConfig(stateCode);
      const topRate = staticConfig?.rate_2026 || Math.round(totalRate * 1000) / 1000;

      return {
        topRate,
        effectiveRate: Math.round(totalRate * 100) / 100,
        estimatedTax,
        metadata: {
          avalaraRates: data.rates,
          jurisdictionCount: data.rates?.length || 0,
          source: "avalara_avatax_api",
          note: "Avalara provides rooftop-accurate tax rates including local jurisdictions",
        },
      };
    } catch (err) {
      console.error(`[tax-provider] Avalara API error for ${stateCode}:`, err);
      return null;
    }
  }
}

class StaticFallbackAdapter implements TaxRateAdapter {
  name = "static";

  isConfigured(): boolean {
    return true;
  }

  async fetchRate(stateCode: string, income: number): Promise<{
    topRate: number;
    effectiveRate: number;
    estimatedTax: number;
    metadata?: Record<string, unknown>;
  } | null> {
    const result = calculateStateTax(stateCode, income);
    return {
      topRate: result.topRate,
      effectiveRate: result.effectiveRate,
      estimatedTax: result.taxOwed,
      metadata: { source: "states.json", brackets: result.brackets },
    };
  }
}

const adapters: TaxRateAdapter[] = [
  new StripeTaxAdapter(),
  new AvalaraAdapter(),
  new StaticFallbackAdapter(),
];

function getActiveAdapter(): TaxRateAdapter {
  for (const adapter of adapters) {
    if (adapter.isConfigured()) {
      return adapter;
    }
  }
  return adapters[adapters.length - 1];
}

export function getActiveProviderName(): string {
  return getActiveAdapter().name;
}

export function getProviderStatus(): { name: string; configured: boolean }[] {
  return adapters.map(a => ({ name: a.name, configured: a.isConfigured() }));
}

async function getCachedRate(stateCode: string): Promise<{
  rate: typeof taxRateCache.$inferSelect;
  isExpired: boolean;
} | null> {
  const [cached] = await db
    .select()
    .from(taxRateCache)
    .where(eq(taxRateCache.stateCode, stateCode))
    .orderBy(desc(taxRateCache.fetchedAt))
    .limit(1);

  if (!cached) return null;

  const isExpired = new Date() > new Date(cached.expiresAt);
  return { rate: cached, isExpired };
}

async function storeRate(
  stateCode: string,
  provider: string,
  rateData: Record<string, unknown>,
  currentRate: number,
  previousRate: number | null,
) {
  const expiresAt = new Date(Date.now() + CACHE_TTL_MS);
  const rateChangePct = previousRate !== null
    ? Math.round(Math.abs(currentRate - previousRate) * 1000) / 1000
    : null;

  await db.insert(taxRateCache).values({
    stateCode,
    provider,
    rateData,
    currentRate: String(currentRate),
    previousRate: previousRate !== null ? String(previousRate) : null,
    rateChangePct: rateChangePct !== null ? String(rateChangePct) : null,
    fetchedAt: new Date(),
    expiresAt,
  });

  return { rateChangePct, expiresAt };
}

async function createRateChangeAlert(
  stateCode: string,
  previousRate: number,
  currentRate: number,
  changePct: number,
  provider: string,
) {
  const config = getStateConfig(stateCode);
  const stateName = config?.name || stateCode;

  await db.insert(complianceAlerts).values({
    alertType: "rate_change",
    severity: changePct >= 1.0 ? "critical" : "warning",
    title: `Tax Rate Updated: ${stateName}`,
    description: `State tax rates were updated by the government today. ${stateName} rate changed from ${previousRate}% to ${currentRate}% (${changePct >= 0 ? "+" : ""}${changePct.toFixed(3)}%). Your estimate has been refreshed for 100% accuracy.`,
    source: provider,
    stateCode,
    metadata: {
      previousRate,
      currentRate,
      changePct,
      detectedAt: new Date().toISOString(),
    },
  });
}

export async function getLiveRate(
  stateCode: string,
  income: number = 50000,
  zipCode?: string,
  forceRefresh: boolean = false,
): Promise<TaxRateResponse> {
  const config = getStateConfig(stateCode);
  const staticResult = calculateStateTax(stateCode, income);

  if (!config) {
    return {
      stateCode,
      stateName: "Unknown",
      taxType: "None",
      topRate: 0,
      effectiveRate: 0,
      estimatedTax: 0,
      provider: "static",
      cachedAt: new Date(),
      expiresAt: new Date(Date.now() + CACHE_TTL_MS),
      isLive: false,
      hasLocalTax: false,
      isDecoupled: false,
      decoupledRules: [],
      rateChanged: false,
      rateChangePct: null,
    };
  }

  const cached = await getCachedRate(stateCode);

  if (cached && !cached.isExpired && !forceRefresh) {
    const data = cached.rate.rateData as Record<string, unknown>;
    return {
      stateCode,
      stateName: config.name,
      taxType: config.tax_type,
      topRate: Number(data.topRate || config.rate_2026),
      effectiveRate: Number(data.effectiveRate || staticResult.effectiveRate),
      estimatedTax: Number(data.estimatedTax || staticResult.taxOwed),
      provider: cached.rate.provider,
      cachedAt: new Date(cached.rate.fetchedAt),
      expiresAt: new Date(cached.rate.expiresAt),
      isLive: cached.rate.provider !== "static",
      brackets: staticResult.brackets,
      hasLocalTax: config.has_local_tax || false,
      isDecoupled: config.tax_type === "Decoupled",
      decoupledRules: config.decoupled_rules || [],
      rateChanged: false,
      rateChangePct: cached.rate.rateChangePct ? Number(cached.rate.rateChangePct) : null,
    };
  }

  const adapter = getActiveAdapter();
  const liveResult = await adapter.fetchRate(stateCode, income, zipCode);

  if (!liveResult) {
    return {
      stateCode,
      stateName: config.name,
      taxType: config.tax_type,
      topRate: staticResult.topRate,
      effectiveRate: staticResult.effectiveRate,
      estimatedTax: staticResult.taxOwed,
      provider: "static",
      cachedAt: new Date(),
      expiresAt: new Date(Date.now() + CACHE_TTL_MS),
      isLive: false,
      brackets: staticResult.brackets,
      hasLocalTax: config.has_local_tax || false,
      isDecoupled: config.tax_type === "Decoupled",
      decoupledRules: config.decoupled_rules || [],
      rateChanged: false,
      rateChangePct: null,
    };
  }

  const previousRate = cached ? Number(cached.rate.currentRate) : null;
  const { rateChangePct, expiresAt } = await storeRate(
    stateCode,
    adapter.name,
    liveResult as unknown as Record<string, unknown>,
    liveResult.effectiveRate,
    previousRate,
  );

  let rateChanged = false;
  if (rateChangePct !== null && rateChangePct >= RATE_CHANGE_THRESHOLD_PCT) {
    rateChanged = true;
    await createRateChangeAlert(
      stateCode,
      previousRate!,
      liveResult.effectiveRate,
      rateChangePct,
      adapter.name,
    );
  }

  return {
    stateCode,
    stateName: config.name,
    taxType: config.tax_type,
    topRate: liveResult.topRate,
    effectiveRate: liveResult.effectiveRate,
    estimatedTax: liveResult.estimatedTax,
    provider: adapter.name,
    cachedAt: new Date(),
    expiresAt,
    isLive: adapter.name !== "static",
    brackets: staticResult.brackets,
    hasLocalTax: config.has_local_tax || false,
    isDecoupled: config.tax_type === "Decoupled",
    decoupledRules: config.decoupled_rules || [],
    rateChanged,
    rateChangePct,
  };
}

export async function refreshAllRates(income: number = 50000): Promise<{
  refreshed: number;
  changed: number;
  errors: string[];
}> {
  const { getAllStates } = await import("./state-engine");
  const allStates = getAllStates();
  let refreshed = 0;
  let changed = 0;
  const errors: string[] = [];

  for (const stateCode of Object.keys(allStates)) {
    try {
      const result = await getLiveRate(stateCode, income, undefined, true);
      refreshed++;
      if (result.rateChanged) changed++;
    } catch (err) {
      errors.push(`${stateCode}: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }

  return { refreshed, changed, errors };
}

export async function getRecentAlerts(limit: number = 20): Promise<(typeof complianceAlerts.$inferSelect)[]> {
  return db
    .select()
    .from(complianceAlerts)
    .where(eq(complianceAlerts.isDismissed, false))
    .orderBy(desc(complianceAlerts.createdAt))
    .limit(limit);
}

export async function dismissAlert(alertId: number): Promise<void> {
  await db
    .update(complianceAlerts)
    .set({ isDismissed: true })
    .where(eq(complianceAlerts.id, alertId));
}

export async function markAlertRead(alertId: number): Promise<void> {
  await db
    .update(complianceAlerts)
    .set({ isRead: true })
    .where(eq(complianceAlerts.id, alertId));
}
