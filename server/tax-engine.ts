import {
  IRS_MILEAGE_RATE, SE_TAX_RATE, SE_TAXABLE_BASE, QUARTERLY_DEADLINES,
  SALT_DEDUCTION_CAP, mapToIRSCategory,
  type TaxSummary
} from "@shared/schema";

export interface TaxEngineInput {
  incomes: Array<{ amount: number; platformFees: number; miles: number; source: string; isTips: boolean }>;
  expenses: Array<{ amount: number; category: string; vehicleId?: number | null }>;
  mileageLogs: Array<{ totalMiles: number }>;
  vehicles: Array<{ id: number; mileageMethod: string }>;
}

/**
 * Pure tax calculation engine — no DB, no side effects.
 *
 * @compliance IRS Schedule C (Form 1040), Schedule SE, IRC Sec. 162, 274(d), 1401
 * @compliance OBBBA Sec. 101 (2026) — No Tax on Tips federal exemption
 * @why Extracted from DatabaseStorage.getTaxSummary() for testability.
 *      All inputs are plain objects; all outputs are deterministic.
 */
export function calculateTaxSummary(input: TaxEngineInput): TaxSummary {
  const { incomes, expenses, mileageLogs, vehicles } = input;
  const vehicleMap = new Map(vehicles.map(v => [v.id, v]));

  const grossIncome = incomes.reduce((sum, inc) => sum + inc.amount, 0);
  const totalPlatformFees = incomes.reduce((sum, inc) => sum + (inc.platformFees || 0), 0);
  const tipIncome = incomes
    .filter(inc => inc.isTips)
    .reduce((sum, inc) => sum + inc.amount, 0);
  const tipExemption = tipIncome;

  const incomeMiles = incomes.reduce((sum, inc) => sum + (inc.miles || 0), 0);
  const loggedMiles = mileageLogs.reduce((sum, log) => sum + log.totalMiles, 0);
  const totalMiles = incomeMiles + loggedMiles;

  const mileageDeduction = totalMiles * IRS_MILEAGE_RATE;

  let totalOtherExpenses = 0;
  const expensesByCategory: Record<string, number> = {};
  expenses.forEach(exp => {
    const irsCategory = mapToIRSCategory(exp.category);
    const amount = exp.amount;

    const vehicle = exp.vehicleId ? vehicleMap.get(exp.vehicleId) : undefined;
    const isStandardMileage = vehicle ? vehicle.mileageMethod === "standard" : true;
    const isCarExpense = irsCategory === "Car and Truck Expenses";
    if (isStandardMileage && isCarExpense) {
      expensesByCategory[irsCategory] = (expensesByCategory[irsCategory] || 0) + amount;
    } else {
      totalOtherExpenses += amount;
      expensesByCategory[irsCategory] = (expensesByCategory[irsCategory] || 0) + amount;
    }
  });

  const totalDeductions = totalPlatformFees + mileageDeduction + totalOtherExpenses;
  const netProfit = grossIncome - totalDeductions;

  const seTaxableBase = Math.max(0, netProfit * SE_TAXABLE_BASE);
  const selfEmploymentTax = seTaxableBase * SE_TAX_RATE;
  const seDeduction = selfEmploymentTax / 2;
  const estimatedQuarterlyPayment = selfEmploymentTax / 4;

  const incomeBySource: Record<string, number> = {};
  incomes.forEach(inc => {
    incomeBySource[inc.source] = (incomeBySource[inc.source] || 0) + inc.amount;
  });

  return {
    grossIncome,
    totalPlatformFees,
    totalMiles,
    mileageDeduction,
    totalOtherExpenses,
    totalDeductions,
    netProfit,
    seTaxableBase,
    selfEmploymentTax,
    seDeduction,
    estimatedQuarterlyPayment,
    expensesByCategory,
    incomeBySource,
    quarterlyDeadlines: QUARTERLY_DEADLINES,
    mileageRate: IRS_MILEAGE_RATE,
    tipIncome,
    tipExemption,
    saltDeductionCap: SALT_DEDUCTION_CAP,
  };
}
