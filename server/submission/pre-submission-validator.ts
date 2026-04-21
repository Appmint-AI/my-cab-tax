import type { SubmissionData } from "./types";
import type { User } from "@shared/models/auth";
import { analyzeJurisdiction } from "./jurisdiction-rules";

export interface ValidationError {
  code: string;
  field: string;
  message: string;
  severity: "error" | "warning";
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  preflightScore: number;
  preflightChecks: PreflightCheck[];
}

export interface PreflightCheck {
  label: string;
  passed: boolean;
  required: boolean;
}

export function validatePreSubmission(data: SubmissionData, user?: User): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];
  const preflightChecks: PreflightCheck[] = [];

  const idVerified = !!user?.isVerified;
  preflightChecks.push({ label: "Identity Verified", passed: idVerified, required: true });
  if (!idVerified) {
    errors.push({
      code: "IDENTITY_NOT_VERIFIED",
      field: "user.isVerified",
      message: "Identity verification is required before filing. Complete the verification process first.",
      severity: "error",
    });
  }

  const hasIncome = data.incomes.length > 0 && data.summary.grossIncome > 0;
  preflightChecks.push({ label: "Income Recorded", passed: hasIncome, required: true });
  if (!hasIncome) {
    errors.push({
      code: "NO_INCOME_RECORDS",
      field: "incomes",
      message: "No income records found. You must have at least one income entry to file.",
      severity: "error",
    });
  }

  const grossReceipts = data.summary.grossIncome;
  const grossIncome = grossReceipts - data.summary.totalPlatformFees;
  const netProfit = data.summary.netProfit;

  const nonZeroPassed = grossReceipts !== 0 && grossIncome !== 0 && netProfit !== 0;
  preflightChecks.push({ label: "Non-Zero Integrity (Lines 1, 7, 31)", passed: nonZeroPassed, required: true });
  if (grossReceipts === 0) {
    errors.push({
      code: "LINE1_ZERO",
      field: "summary.grossIncome",
      message: "Line 1 (Gross Receipts) is $0.00. The IRS MeF system will reject a return with zero gross receipts for a driver.",
      severity: "error",
    });
  }
  if (grossIncome === 0 && grossReceipts > 0) {
    warnings.push({
      code: "LINE7_ZERO",
      field: "summary.grossIncome",
      message: "Line 7 (Gross Income) is $0.00 after fees. Verify your platform fees are not consuming 100% of your gross receipts.",
      severity: "warning",
    });
  }
  if (netProfit === 0 && grossReceipts > 0) {
    warnings.push({
      code: "LINE31_ZERO",
      field: "summary.netProfit",
      message: "Line 31 (Net Profit) is $0.00. While possible, the IRS may flag a return with exactly zero net profit.",
      severity: "warning",
    });
  }

  const form1099KEntries = data.incomes.filter(i => i.source === "1099-K" || i.source?.includes("1099"));
  const total1099K = form1099KEntries.reduce((sum, i) => sum + Number(i.amount), 0);
  const has1099K = form1099KEntries.length > 0;
  const mismatch1099K = has1099K && grossReceipts < total1099K;
  preflightChecks.push({ label: "1099-K Cross-Check", passed: !mismatch1099K, required: has1099K });
  if (mismatch1099K) {
    errors.push({
      code: "1099K_MISMATCH",
      field: "summary.grossIncome",
      message: `Your reported Gross Receipts ($${grossReceipts.toFixed(2)}) are lower than your 1099-K total ($${total1099K.toFixed(2)}). This is an automatic audit trigger. Did you account for all platform fees and gross-ups?`,
      severity: "error",
    });
  }

  if (data.summary.grossIncome > 0 && data.summary.totalDeductions > data.summary.grossIncome * 1.5) {
    warnings.push({
      code: "DEDUCTIONS_EXCEED_INCOME",
      field: "summary.totalDeductions",
      message: `Total deductions ($${data.summary.totalDeductions.toFixed(2)}) significantly exceed gross income ($${data.summary.grossIncome.toFixed(2)}). The IRS may flag this for review.`,
      severity: "warning",
    });
  }

  const computedNet = data.summary.grossIncome - data.summary.totalDeductions;
  const netDiff = Math.abs(computedNet - data.summary.netProfit);
  if (netDiff > 0.02) {
    errors.push({
      code: "GROSS_NET_MISMATCH",
      field: "summary.netProfit",
      message: `Gross-to-Net math error: Gross ($${data.summary.grossIncome.toFixed(2)}) minus Deductions ($${data.summary.totalDeductions.toFixed(2)}) = $${computedNet.toFixed(2)}, but Net Profit shows $${data.summary.netProfit.toFixed(2)}.`,
      severity: "error",
    });
  }

  const hasMileageLogs = data.mileageLogs.length > 0;
  preflightChecks.push({ label: "Mileage Log Complete", passed: hasMileageLogs || data.summary.totalMiles === 0, required: false });
  if (data.summary.totalMiles > 0 && !hasMileageLogs) {
    warnings.push({
      code: "MILEAGE_NO_LOGS",
      field: "mileageLogs",
      message: "You have mileage from income entries but no contemporaneous mileage log. IRS Publication 463 requires written records kept at or near the time of travel.",
      severity: "warning",
    });
  }

  if (data.summary.totalMiles > 50000) {
    warnings.push({
      code: "HIGH_MILEAGE",
      field: "summary.totalMiles",
      message: `${data.summary.totalMiles.toLocaleString()} total miles is unusually high. The IRS may request additional documentation.`,
      severity: "warning",
    });
  }

  for (const income of data.incomes) {
    if (Number(income.amount) > 0 && Number(income.platformFees || 0) > Number(income.amount)) {
      errors.push({
        code: "FEES_EXCEED_INCOME",
        field: `income.${income.id}`,
        message: `Income entry from ${income.source} on ${income.date}: Platform fees ($${Number(income.platformFees).toFixed(2)}) exceed gross income ($${Number(income.amount).toFixed(2)}).`,
        severity: "error",
      });
    }
  }

  for (const expense of data.expenses) {
    if (!expense.category || expense.category.trim() === "") {
      errors.push({
        code: "MISSING_EXPENSE_CATEGORY",
        field: `expense.${expense.id}`,
        message: `Expense on ${expense.date} ($${Number(expense.amount).toFixed(2)}) has no IRS category assigned.`,
        severity: "error",
      });
    }
  }

  const receiptExpenseIds = new Set(data.receipts.map(r => r.expenseId).filter(Boolean));
  const expensesOver75WithoutReceipts = data.expenses.filter(
    e => Number(e.amount) >= 75 && !receiptExpenseIds.has(e.id)
  );
  const hasReceiptsFor75 = expensesOver75WithoutReceipts.length === 0;
  preflightChecks.push({ label: "Receipts for $75+ Expenses", passed: hasReceiptsFor75, required: false });
  if (expensesOver75WithoutReceipts.length > 0) {
    warnings.push({
      code: "MISSING_RECEIPTS_OVER_75",
      field: "receipts",
      message: `${expensesOver75WithoutReceipts.length} expense(s) over $75 are missing receipt documentation. The IRS requires receipts for expenses $75 and above.`,
      severity: "warning",
    });
  }

  if (data.expenses.length > 0 && data.receipts.length === 0) {
    warnings.push({
      code: "NO_RECEIPTS",
      field: "receipts",
      message: "You have expenses but no receipt images in your vault. Consider scanning your receipts for better audit protection.",
      severity: "warning",
    });
  }

  if (data.taxYear < 2020 || data.taxYear > new Date().getFullYear() + 1) {
    errors.push({
      code: "INVALID_TAX_YEAR",
      field: "taxYear",
      message: `Tax year ${data.taxYear} is outside the valid filing range.`,
      severity: "error",
    });
  }

  const hasDuplicateIncomes = checkDuplicates(
    data.incomes.map(i => `${i.date}-${i.source}-${Number(i.amount).toFixed(2)}`)
  );
  if (hasDuplicateIncomes) {
    warnings.push({
      code: "DUPLICATE_INCOME_ENTRIES",
      field: "incomes",
      message: "Possible duplicate income entries detected (same date, source, and amount). Please verify these are not duplicates.",
      severity: "warning",
    });
  }

  const jurisdictionData = (data as any).jurisdiction;
  const hasStateCode = !!jurisdictionData?.stateCode;
  preflightChecks.push({ label: "Filing State Set", passed: hasStateCode, required: false });
  if (!hasStateCode) {
    warnings.push({
      code: "NO_STATE_SELECTED",
      field: "jurisdiction.stateCode",
      message: "No filing state selected. Without a state, CF/SF auto-forwarding cannot be configured. Set your state in Settings > Tax Filing Jurisdiction.",
      severity: "warning",
    });
  }

  const localTaxEnabled = !!jurisdictionData?.localTaxEnabled;
  const localJurisdiction = jurisdictionData?.localTaxJurisdiction;
  if (localTaxEnabled && !localJurisdiction) {
    warnings.push({
      code: "LOCAL_TAX_NO_JURISDICTION",
      field: "jurisdiction.localTaxJurisdiction",
      message: "Local tax filing is enabled but no local jurisdiction is selected. Select a jurisdiction in Settings to generate your Local EIT Statement.",
      severity: "warning",
    });
  }

  if (hasStateCode) {
    const analysis = analyzeJurisdiction({
      stateCode: jurisdictionData.stateCode,
      localTaxEnabled,
      localTaxJurisdiction: localJurisdiction || null,
      partialYearResident: jurisdictionData?.partialYearResident || false,
      partialYearStates: (jurisdictionData?.partialYearStates as string[]) || [],
      netProfit: data.summary.netProfit,
      grossIncome: data.summary.grossIncome,
      tipIncomeAmount: jurisdictionData?.tipIncomeAmount ? Number(jurisdictionData.tipIncomeAmount) : 0,
    });

    for (const rule of analysis.stateRules) {
      if (rule.severity === "warning" || rule.severity === "action") {
        warnings.push({
          code: rule.code,
          field: "jurisdiction",
          message: rule.message,
          severity: "warning",
        });
      }
    }
  }

  const filingState = jurisdictionData?.stateCode;
  if (filingState) {
    const incomesWithPayeeState = data.incomes.filter((i: any) => i.payeeState);
    if (incomesWithPayeeState.length > 0) {
      const mismatchedIncomes = incomesWithPayeeState.filter((i: any) => i.payeeState !== filingState);
      if (mismatchedIncomes.length > 0) {
        const states = Array.from(new Set(mismatchedIncomes.map((i: any) => i.payeeState)));
        warnings.push({
          code: "1099K_STATE_MISMATCH",
          field: "incomes.payeeState",
          message: `${mismatchedIncomes.length} income record(s) have 1099-K payee addresses in ${states.join(", ")}, but your filing state is ${filingState}. The IRS may flag this discrepancy. Verify your platform account addresses match your filing state.`,
          severity: "warning",
        });
      }
    }
    const tripsWithState = data.mileageLogs.filter((m: any) => m.tripState);
    if (tripsWithState.length > 0) {
      const outOfStateMiles = tripsWithState.filter((m: any) => m.tripState !== filingState);
      const outOfStatePercent = Math.round((outOfStateMiles.length / tripsWithState.length) * 100);
      if (outOfStatePercent >= 90) {
        const topStates = Array.from(new Set(outOfStateMiles.map((m: any) => m.tripState))).slice(0, 3);
        warnings.push({
          code: "MILEAGE_STATE_MISMATCH",
          field: "mileageLogs.tripState",
          message: `${outOfStatePercent}% of your logged trips are in ${topStates.join("/")} — not your filing state (${filingState}). The IRS expects most driving activity to occur in your state of residence. Consider updating your filing state if you primarily drive elsewhere.`,
          severity: "warning",
        });
      }
    }

    const dlState = (user as any)?.dlStateOcr;
    if (dlState && dlState !== filingState) {
      const residencyStatus = (user as any)?.residencyStatus;
      if (!residencyStatus || residencyStatus === "") {
        warnings.push({
          code: "DL_STATE_UNRESOLVED",
          field: "user.dlStateOcr",
          message: `Your Driver's License is from ${dlState} but your filing state is ${filingState}. Complete the residency clarification in your profile before filing.`,
          severity: "warning",
        });
      }
    }
  }

  const jurisdictionConsistencyPassed = warnings.filter(w =>
    w.code === "1099K_STATE_MISMATCH" || w.code === "MILEAGE_STATE_MISMATCH" || w.code === "DL_STATE_UNRESOLVED"
  ).length === 0;
  preflightChecks.push({ label: "Jurisdiction Consistency", passed: jurisdictionConsistencyPassed, required: false });

  const totalChecks = preflightChecks.length;
  const passedChecks = preflightChecks.filter(c => c.passed).length;
  const preflightScore = totalChecks > 0 ? Math.round((passedChecks / totalChecks) * 100) : 0;

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    preflightScore,
    preflightChecks,
  };
}

function checkDuplicates(keys: string[]): boolean {
  const seen = new Set<string>();
  for (const key of keys) {
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}
