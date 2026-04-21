import { db } from "./db";
import { expenses, incomes } from "@shared/schema";
import { eq, isNull, and } from "drizzle-orm";
import { getRate } from "./currency-engine";

export async function anchorUserTransactions(userId: string, currency: string): Promise<{ anchored: number; skipped: number }> {
  let anchored = 0;
  let skipped = 0;

  if (currency === "USD") {
    return { anchored: 0, skipped: 0 };
  }

  const rate = await getRate(currency, "USD");
  if (!rate) {
    throw new Error(`No exchange rate available for ${currency} → USD`);
  }

  const userExpenses = await db.select().from(expenses)
    .where(and(eq(expenses.userId, userId), isNull(expenses.anchoredAt)));

  for (const exp of userExpenses) {
    const usdAmount = parseFloat(exp.amount) * rate;
    await db.update(expenses)
      .set({
        anchorCurrency: currency,
        anchoredUsdAmount: usdAmount.toFixed(2),
        anchoredAt: new Date(),
      })
      .where(eq(expenses.id, exp.id));
    anchored++;
  }

  const userIncomes = await db.select().from(incomes)
    .where(and(eq(incomes.userId, userId), isNull(incomes.anchoredAt)));

  for (const inc of userIncomes) {
    const usdAmount = parseFloat(inc.amount) * rate;
    await db.update(incomes)
      .set({
        anchorCurrency: currency,
        anchoredUsdAmount: usdAmount.toFixed(2),
        anchoredAt: new Date(),
      })
      .where(eq(incomes.id, inc.id));
    anchored++;
  }

  return { anchored, skipped };
}

export async function getAnchorStatus(userId: string): Promise<{
  totalExpenses: number;
  anchoredExpenses: number;
  totalIncomes: number;
  anchoredIncomes: number;
  unanchoredCount: number;
}> {
  const allExpenses = await db.select().from(expenses).where(eq(expenses.userId, userId));
  const allIncomes = await db.select().from(incomes).where(eq(incomes.userId, userId));

  const anchoredExpenses = allExpenses.filter(e => e.anchoredAt !== null).length;
  const anchoredIncomes = allIncomes.filter(i => i.anchoredAt !== null).length;

  return {
    totalExpenses: allExpenses.length,
    anchoredExpenses,
    totalIncomes: allIncomes.length,
    anchoredIncomes,
    unanchoredCount: (allExpenses.length - anchoredExpenses) + (allIncomes.length - anchoredIncomes),
  };
}
