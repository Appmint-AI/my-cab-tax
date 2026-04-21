import { describe, it, expect } from "vitest";
import { calculateTaxSummary, type TaxEngineInput } from "../server/tax-engine";
import {
  IRS_MILEAGE_RATE, SE_TAX_RATE, SE_TAXABLE_BASE,
  SALT_DEDUCTION_CAP, QUARTERLY_DEADLINES
} from "../shared/schema";

function makeInput(overrides: Partial<TaxEngineInput> = {}): TaxEngineInput {
  return {
    incomes: [],
    expenses: [],
    mileageLogs: [],
    vehicles: [],
    ...overrides,
  };
}

describe("Tax Engine — 2026 IRS Compliance Suite", () => {

  it("1. Zero-income driver: all values should be zero", () => {
    const result = calculateTaxSummary(makeInput());
    expect(result.grossIncome).toBe(0);
    expect(result.netProfit).toBe(0);
    expect(result.selfEmploymentTax).toBe(0);
    expect(result.totalDeductions).toBe(0);
    expect(result.tipIncome).toBe(0);
    expect(result.tipExemption).toBe(0);
    expect(result.mileageRate).toBe(0.725);
    expect(result.saltDeductionCap).toBe(40000);
  });

  it("2. Basic rideshare driver: $50,000 gross, 15,000 miles, $3,000 expenses", () => {
    const result = calculateTaxSummary(makeInput({
      incomes: [
        { amount: 50000, platformFees: 12500, miles: 15000, source: "Uber", isTips: false },
      ],
      expenses: [
        { amount: 1500, category: "Insurance", vehicleId: null },
        { amount: 800, category: "Phone", vehicleId: null },
        { amount: 700, category: "Meals", vehicleId: null },
      ],
    }));

    expect(result.grossIncome).toBe(50000);
    expect(result.totalPlatformFees).toBe(12500);
    expect(result.totalMiles).toBe(15000);
    expect(result.mileageDeduction).toBe(15000 * 0.725);
    expect(result.totalOtherExpenses).toBe(3000);
    expect(result.totalDeductions).toBe(12500 + 10875 + 3000);
    expect(result.netProfit).toBe(50000 - 26375);
    expect(result.selfEmploymentTax).toBeCloseTo(
      Math.max(0, result.netProfit * SE_TAXABLE_BASE) * SE_TAX_RATE, 2
    );
  });

  it("3. 2026 Mileage Rate: must be 72.5 cents per mile (IRS Notice 2026-01)", () => {
    expect(IRS_MILEAGE_RATE).toBe(0.725);

    const result = calculateTaxSummary(makeInput({
      incomes: [{ amount: 10000, platformFees: 0, miles: 1000, source: "Lyft", isTips: false }],
    }));
    expect(result.mileageDeduction).toBe(725);
  });

  it("4. No Tax on Tips (OBBBA Sec. 101): tip income is tracked and exempt", () => {
    const result = calculateTaxSummary(makeInput({
      incomes: [
        { amount: 30000, platformFees: 7500, miles: 10000, source: "Uber", isTips: false },
        { amount: 5000, platformFees: 0, miles: 0, source: "Tips", isTips: true },
      ],
    }));

    expect(result.tipIncome).toBe(5000);
    expect(result.tipExemption).toBe(5000);
    expect(result.grossIncome).toBe(35000);
  });

  it("5. SALT Deduction Cap: must be $40,000 for 2026", () => {
    expect(SALT_DEDUCTION_CAP).toBe(40000);

    const result = calculateTaxSummary(makeInput({
      incomes: [{ amount: 100000, platformFees: 0, miles: 0, source: "Uber", isTips: false }],
      expenses: [
        { amount: 45000, category: "Property Tax (SALT)", vehicleId: null },
      ],
    }));

    expect(result.saltDeductionCap).toBe(40000);
    expect(result.expensesByCategory["Property Tax (SALT)"]).toBe(45000);
    expect(result.totalOtherExpenses).toBe(45000);
  });

  it("6. SE Tax calculation: 15.3% on 92.35% of net profit (IRC Sec. 1401)", () => {
    const result = calculateTaxSummary(makeInput({
      incomes: [{ amount: 60000, platformFees: 10000, miles: 20000, source: "Uber", isTips: false }],
    }));

    const expectedMileageDeduction = 20000 * 0.725;
    const expectedNetProfit = 60000 - 10000 - expectedMileageDeduction;
    const expectedSEBase = expectedNetProfit * 0.9235;
    const expectedSETax = expectedSEBase * 0.153;

    expect(result.netProfit).toBeCloseTo(expectedNetProfit, 2);
    expect(result.seTaxableBase).toBeCloseTo(expectedSEBase, 2);
    expect(result.selfEmploymentTax).toBeCloseTo(expectedSETax, 2);
    expect(result.seDeduction).toBeCloseTo(expectedSETax / 2, 2);
  });

  it("7. Quarterly estimated payments: SE tax divided by 4 with correct deadlines", () => {
    const result = calculateTaxSummary(makeInput({
      incomes: [{ amount: 40000, platformFees: 5000, miles: 10000, source: "Lyft", isTips: false }],
    }));

    expect(result.estimatedQuarterlyPayment).toBeCloseTo(result.selfEmploymentTax / 4, 2);
    expect(result.quarterlyDeadlines).toEqual(QUARTERLY_DEADLINES);
    expect(result.quarterlyDeadlines).toHaveLength(4);
    expect(result.quarterlyDeadlines[0]).toBe("2026-04-15");
    expect(result.quarterlyDeadlines[3]).toBe("2027-01-15");
  });

  it("8. Net loss scenario: negative net profit, SE tax floor at zero", () => {
    const result = calculateTaxSummary(makeInput({
      incomes: [{ amount: 5000, platformFees: 1000, miles: 20000, source: "Uber", isTips: false }],
      expenses: [
        { amount: 2000, category: "Insurance", vehicleId: null },
        { amount: 1000, category: "Office Expense", vehicleId: null },
      ],
    }));

    const expectedMileage = 20000 * 0.725;
    const expectedDeductions = 1000 + expectedMileage + 3000;
    expect(result.netProfit).toBe(5000 - expectedDeductions);
    expect(result.netProfit).toBeLessThan(0);
    expect(result.seTaxableBase).toBe(0);
    expect(result.selfEmploymentTax).toBe(0);
    expect(result.estimatedQuarterlyPayment).toBe(0);
  });

  it("9. Legacy category mapping: old categories map to IRS Schedule C categories", () => {
    const result = calculateTaxSummary(makeInput({
      incomes: [{ amount: 20000, platformFees: 0, miles: 0, source: "Uber", isTips: false }],
      expenses: [
        { amount: 500, category: "Gas", vehicleId: null },
        { amount: 300, category: "Car Wash", vehicleId: null },
        { amount: 200, category: "Tolls", vehicleId: null },
        { amount: 100, category: "Phone", vehicleId: null },
        { amount: 50, category: "Meals", vehicleId: null },
      ],
    }));

    expect(result.expensesByCategory["Car and Truck Expenses"]).toBe(1000);
    expect(result.expensesByCategory["Office Expense"]).toBe(100);
    expect(result.expensesByCategory["Other Expenses"]).toBe(50);
  });

  it("10. Multi-source income aggregation with combined mileage from logs and income entries", () => {
    const result = calculateTaxSummary(makeInput({
      incomes: [
        { amount: 25000, platformFees: 6250, miles: 5000, source: "Uber", isTips: false },
        { amount: 15000, platformFees: 3750, miles: 3000, source: "Lyft", isTips: false },
        { amount: 3000, platformFees: 0, miles: 0, source: "Tips", isTips: true },
      ],
      mileageLogs: [
        { totalMiles: 2000 },
        { totalMiles: 1500 },
      ],
    }));

    expect(result.grossIncome).toBe(43000);
    expect(result.totalPlatformFees).toBe(10000);
    expect(result.totalMiles).toBe(5000 + 3000 + 2000 + 1500);
    expect(result.mileageDeduction).toBe(11500 * 0.725);
    expect(result.incomeBySource["Uber"]).toBe(25000);
    expect(result.incomeBySource["Lyft"]).toBe(15000);
    expect(result.incomeBySource["Tips"]).toBe(3000);
    expect(result.tipIncome).toBe(3000);
    expect(result.tipExemption).toBe(3000);
  });

});
