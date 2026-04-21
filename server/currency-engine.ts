import { db } from "./db";
import { currencyRates, vaultLocks, SUPPORTED_CURRENCIES, type CurrencyConversion, type DHIPStatus } from "@shared/schema";
import { eq, and, gt } from "drizzle-orm";

const RATE_TTL_HOURS = 1;
const VOLATILITY_THRESHOLD = 5;

const HIGH_INFLATION_CURRENCIES = new Set(["ARS", "LBP", "VES", "TRY", "NGN", "EGP", "PKR"]);

interface RateResponse {
  rates: Record<string, number>;
  base: string;
}

async function fetchLiveRates(base: string = "USD"): Promise<RateResponse> {
  try {
    const res = await fetch(`https://open.er-api.com/v6/latest/${base}`);
    if (!res.ok) throw new Error(`Forex API returned ${res.status}`);
    const data = await res.json();
    if (data.result !== "success") throw new Error("Forex API error");
    return { rates: data.rates, base: data.base_code };
  } catch (err) {
    console.error("[DHIP] Live rate fetch failed, using fallback:", err);
    return { rates: getFallbackRates(), base: "USD" };
  }
}

function getFallbackRates(): Record<string, number> {
  return {
    USD: 1, EUR: 0.92, GBP: 0.79, PKR: 278.5, AED: 3.67,
    SAR: 3.75, VND: 25385, INR: 83.4, BDT: 110.5, NGN: 1580,
    KES: 154.2, ZAR: 18.6, BRL: 4.97, MXN: 17.2, PHP: 56.1,
    EGP: 30.9, TRY: 32.4, ARS: 870, LBP: 89500, VES: 36.2,
    XAU: 0.00048,
  };
}

export async function syncForexRates(): Promise<number> {
  const { rates, base } = await fetchLiveRates("USD");
  let synced = 0;

  for (const currency of SUPPORTED_CURRENCIES) {
    if (currency === "USD") continue;
    const rate = rates[currency];
    if (!rate) continue;

    const existing = await db.select().from(currencyRates)
      .where(and(
        eq(currencyRates.baseCurrency, "USD"),
        eq(currencyRates.targetCurrency, currency),
      ))
      .limit(1);

    const previousRate = existing[0]?.rate;
    const volatilityPct = previousRate
      ? Math.abs((rate - parseFloat(previousRate)) / parseFloat(previousRate) * 100).toFixed(4)
      : null;

    if (existing.length > 0) {
      await db.update(currencyRates)
        .set({
          rate: rate.toString(),
          previousRate: previousRate || null,
          volatilityPct,
          fetchedAt: new Date(),
          expiresAt: new Date(Date.now() + RATE_TTL_HOURS * 60 * 60 * 1000),
        })
        .where(eq(currencyRates.id, existing[0].id));
    } else {
      await db.insert(currencyRates).values({
        baseCurrency: "USD",
        targetCurrency: currency,
        rate: rate.toString(),
        previousRate: null,
        volatilityPct: null,
        provider: "exchangerate-api",
        fetchedAt: new Date(),
        expiresAt: new Date(Date.now() + RATE_TTL_HOURS * 60 * 60 * 1000),
      });
    }
    synced++;
  }

  const xauRate = rates["XAU"] || getFallbackRates()["XAU"];
  if (xauRate) {
    const existingXau = await db.select().from(currencyRates)
      .where(and(eq(currencyRates.baseCurrency, "USD"), eq(currencyRates.targetCurrency, "XAU")))
      .limit(1);

    if (existingXau.length > 0) {
      await db.update(currencyRates).set({
        rate: xauRate.toString(),
        fetchedAt: new Date(),
        expiresAt: new Date(Date.now() + RATE_TTL_HOURS * 60 * 60 * 1000),
      }).where(eq(currencyRates.id, existingXau[0].id));
    } else {
      await db.insert(currencyRates).values({
        baseCurrency: "USD",
        targetCurrency: "XAU",
        rate: xauRate.toString(),
        provider: "exchangerate-api",
        fetchedAt: new Date(),
        expiresAt: new Date(Date.now() + RATE_TTL_HOURS * 60 * 60 * 1000),
      });
    }
  }

  console.log(`[DHIP] Synced ${synced} currency rates`);
  return synced;
}

export async function getRate(from: string, to: string): Promise<number | null> {
  if (from === to) return 1;

  const targetCurrency = from === "USD" ? to : from;

  const cached = await db.select().from(currencyRates)
    .where(and(
      eq(currencyRates.baseCurrency, "USD"),
      eq(currencyRates.targetCurrency, targetCurrency),
    ))
    .limit(1);

  const isExpired = cached.length > 0 && new Date(cached[0].expiresAt) < new Date();

  if (cached.length > 0 && !isExpired) {
    const rate = parseFloat(cached[0].rate);
    if (from === "USD") return rate;
    if (to === "USD") return 1 / rate;
    const toRate = await getRate("USD", to);
    if (!toRate) return null;
    return toRate / rate;
  }

  await syncForexRates();

  const fresh = await db.select().from(currencyRates)
    .where(and(
      eq(currencyRates.baseCurrency, "USD"),
      eq(currencyRates.targetCurrency, targetCurrency),
    ))
    .limit(1);

  if (fresh.length > 0) {
    const rate = parseFloat(fresh[0].rate);
    if (from === "USD") return rate;
    if (to === "USD") return 1 / rate;
  }

  return null;
}

export async function convertCurrency(
  amount: number,
  from: string,
  to: string,
  benchmarkAsset: string = "USD"
): Promise<CurrencyConversion> {
  const rate = await getRate(from, to);
  if (!rate) {
    throw new Error(`Unable to get exchange rate for ${from} -> ${to}`);
  }

  const converted = amount * rate;
  const result: CurrencyConversion = { from, to, rate, amount, converted };

  if (benchmarkAsset && benchmarkAsset !== to) {
    const benchmarkRate = await getRate(from, benchmarkAsset);
    if (benchmarkRate) {
      const volatilityData = await db.select().from(currencyRates)
        .where(and(
          eq(currencyRates.baseCurrency, "USD"),
          eq(currencyRates.targetCurrency, from === "USD" ? to : from),
        ))
        .limit(1);

      const volatility = volatilityData[0]?.volatilityPct
        ? parseFloat(volatilityData[0].volatilityPct)
        : 0;

      const stabilityIndex = Math.max(0, 100 - volatility * 10);

      result.benchmark = {
        asset: benchmarkAsset,
        benchmarkRate,
        stabilityIndex: parseFloat(stabilityIndex.toFixed(2)),
      };
    }
  }

  if (HIGH_INFLATION_CURRENCIES.has(from)) {
    const cached = await db.select().from(currencyRates)
      .where(and(
        eq(currencyRates.baseCurrency, "USD"),
        eq(currencyRates.targetCurrency, from),
      ))
      .limit(1);

    if (cached[0]?.volatilityPct && parseFloat(cached[0].volatilityPct) > VOLATILITY_THRESHOLD) {
      result.inflationWarning = `${from} has shown ${parseFloat(cached[0].volatilityPct).toFixed(1)}% volatility since last sync. Consider vault-locking this transaction.`;
    }
  }

  return result;
}

export async function lockTransaction(
  userId: string,
  entityType: "expense" | "income",
  entityId: number,
  originalCurrency: string,
  originalAmount: number,
  benchmarkAsset: string = "USD"
): Promise<{ lock: typeof vaultLocks.$inferSelect; conversion: CurrencyConversion }> {
  const conversion = await convertCurrency(originalAmount, originalCurrency, "USD", benchmarkAsset);

  const [lock] = await db.insert(vaultLocks).values({
    userId,
    entityType,
    entityId,
    originalCurrency,
    originalAmount: originalAmount.toString(),
    lockedRate: conversion.rate.toString(),
    usdAmount: conversion.converted.toString(),
    benchmarkAsset,
    lockedAt: new Date(),
  }).returning();

  return { lock, conversion };
}

export async function getVaultLocks(userId: string): Promise<(typeof vaultLocks.$inferSelect)[]> {
  return db.select().from(vaultLocks).where(eq(vaultLocks.userId, userId));
}

export async function getAllRates(): Promise<(typeof currencyRates.$inferSelect)[]> {
  return db.select().from(currencyRates);
}

export async function getDHIPStatus(userId: string): Promise<DHIPStatus> {
  const rates = await getAllRates();
  const locks = await getVaultLocks(userId);

  const lastSync = rates.length > 0
    ? rates.reduce((latest, r) => {
        const d = new Date(r.fetchedAt);
        return d > latest ? d : latest;
      }, new Date(0)).toISOString()
    : null;

  const volatileWarnings: string[] = [];
  for (const r of rates) {
    if (r.volatilityPct && parseFloat(r.volatilityPct) > VOLATILITY_THRESHOLD) {
      volatileWarnings.push(
        `${r.targetCurrency}: ${parseFloat(r.volatilityPct).toFixed(1)}% volatility detected`
      );
    }
  }

  return {
    activeCurrency: "USD",
    baseCurrency: "USD",
    lastSync,
    ratesAvailable: rates.length,
    volatileWarnings,
    benchmarkAsset: "USD",
    lockedTransactions: locks.length,
  };
}

export function startForexSyncWorker() {
  syncForexRates().catch(err => console.error("[DHIP] Initial sync error:", err));

  setInterval(() => {
    syncForexRates().catch(err => console.error("[DHIP] Periodic sync error:", err));
  }, RATE_TTL_HOURS * 60 * 60 * 1000);

  console.log(`[DHIP] Forex sync worker started (interval: ${RATE_TTL_HOURS}h)`);
}
