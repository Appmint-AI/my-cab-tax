import { db } from "./db";
import { expenses, REGIONAL_EXPENSE_AVERAGES, type AuditRiskResult, type AuditRiskLevel, mapToIRSCategory } from "@shared/schema";
import { eq } from "drizzle-orm";

export async function analyzeAuditRisk(userId: string): Promise<AuditRiskResult> {
  const userExpenses = await db.select().from(expenses).where(eq(expenses.userId, userId));

  const categoryTotals: Record<string, number> = {};
  for (const exp of userExpenses) {
    const irsCategory = mapToIRSCategory(exp.category);
    categoryTotals[irsCategory] = (categoryTotals[irsCategory] || 0) + parseFloat(exp.amount);
  }

  const categoryRisks: AuditRiskResult["categoryRisks"] = [];
  let totalScore = 0;

  for (const [category, regionalAvg] of Object.entries(REGIONAL_EXPENSE_AVERAGES)) {
    const userAmount = categoryTotals[category] || 0;
    const deviationPct = regionalAvg > 0 ? ((userAmount - regionalAvg) / regionalAvg) * 100 : 0;

    let risk: AuditRiskLevel = "low";
    let flag = "";
    let score = 0;

    if (deviationPct > 100) {
      risk = "high";
      flag = `${category} is ${deviationPct.toFixed(0)}% above regional average — likely IRS red flag`;
      score = 3;
    } else if (deviationPct > 50) {
      risk = "medium";
      flag = `${category} is ${deviationPct.toFixed(0)}% above regional average — review recommended`;
      score = 2;
    } else if (deviationPct > 20) {
      risk = "low";
      flag = `${category} is slightly above average`;
      score = 1;
    } else {
      risk = "low";
      flag = `${category} is within normal range`;
      score = 0;
    }

    totalScore += score;
    categoryRisks.push({ category, userAmount, regionalAverage: regionalAvg, deviationPct, risk, flag });
  }

  let overallRisk: AuditRiskLevel = "low";
  if (totalScore >= 10) {
    overallRisk = "high";
  } else if (totalScore >= 5) {
    overallRisk = "medium";
  }

  const recommendations: string[] = [];
  const highRiskCategories = categoryRisks.filter(c => c.risk === "high");
  const mediumRiskCategories = categoryRisks.filter(c => c.risk === "medium");

  if (highRiskCategories.length > 0) {
    recommendations.push(`Review and document justification for: ${highRiskCategories.map(c => c.category).join(", ")}`);
    recommendations.push("Ensure all high-value deductions have receipt documentation in your Receipt Vault");
    recommendations.push("Consider splitting large expense categories into more specific sub-items");
  }

  if (mediumRiskCategories.length > 0) {
    recommendations.push(`Monitor these categories: ${mediumRiskCategories.map(c => c.category).join(", ")}`);
  }

  if (overallRisk === "low") {
    recommendations.push("Your expense profile is within normal parameters for rideshare/delivery drivers");
  }

  if (userExpenses.length === 0) {
    recommendations.push("No expenses logged yet — start tracking to get accurate risk analysis");
  }

  return { overallRisk, totalScore, categoryRisks, recommendations };
}
