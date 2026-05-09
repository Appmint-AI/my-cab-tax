import type { IStorage } from "./storage";

/** Persist `anchor_currency` (+ USD benchmark when convertible) from region + request. */
export async function applyExpenseIncomeAnchors(
  storage: IStorage,
  userId: string,
  amount: number,
  reqBody: Record<string, unknown>,
  row: Record<string, unknown>,
): Promise<void> {
  const user = await storage.getUser(userId);
  const { getRegionConfig } = await import("./geo-detect");
  const bookkeepingCurrency = getRegionConfig(user?.detectedCountry).currency;

  const reqCurrencyRaw =
    (typeof reqBody.currency === "string" && reqBody.currency.trim()) ||
    (typeof row.anchorCurrency === "string" && row.anchorCurrency.trim()) ||
    bookkeepingCurrency;

  const reqCurrency = reqCurrencyRaw || "USD";
  row.anchorCurrency = reqCurrency;

  const amt = Number(amount);
  if (!Number.isFinite(amt)) return;

  if (reqCurrency !== "USD") {
    try {
      const { getRate } = await import("./currency-engine");
      const rate = await getRate(reqCurrency, "USD");
      if (rate) {
        row.anchoredUsdAmount = String(Number((amt * rate).toFixed(2)));
        row.anchoredAt = new Date();
      }
    } catch {
      /* conversion optional */
    }
  } else {
    row.anchoredUsdAmount = String(Number(amt.toFixed(2)));
    row.anchoredAt = new Date();
  }
}
