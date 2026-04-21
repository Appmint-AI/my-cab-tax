import { NO_INCOME_TAX_STATES, HIGH_LOCAL_TAX_JURISDICTIONS } from "./irs-adapter";
import { calculateStateTax, getStateConfig, type TaxType, type StateTaxResult } from "./state-engine";

export { calculateStateTax, getStateConfig, getAllStates, getBucketStates } from "./state-engine";
export type { TaxType, StateTaxResult, StateConfig } from "./state-engine";

export const NO_TAX_ON_TIPS_DECOUPLED_STATES: string[] = [
  "CA", "NY", "NJ", "MA", "MN", "OR", "CT", "HI", "VT", "MD",
];

export interface StateRuleResult {
  code: string;
  label: string;
  severity: "info" | "warning" | "action";
  message: string;
  details?: Record<string, any>;
}

export interface JurisdictionAnalysis {
  stateCode: string;
  stateName: string;
  taxType: TaxType;
  bucketLabel: string;
  hasIncomeTax: boolean;
  cfsfEligible: boolean;
  stateTaxRate: number | null;
  effectiveRate: number;
  stateTaxOwed: number;
  stateRules: StateRuleResult[];
  noTaxOnTipsEligible: boolean;
  tipsDecoupled: boolean;
  federalTipExemption: number;
  stateTipInclusion: number;
  localTaxEnabled: boolean;
  localJurisdiction: string | null;
  localRate: number | null;
  localTaxEstimate: number | null;
  filingComponents: string[];
  requiresStateAdjustment: boolean;
  decoupledRules: string[];
  stateTaxResult: StateTaxResult;
}

export function analyzeJurisdiction(params: {
  stateCode: string | null;
  localTaxEnabled: boolean;
  localTaxJurisdiction: string | null;
  partialYearResident: boolean;
  partialYearStates: string[];
  netProfit: number;
  grossIncome: number;
  tipIncomeAmount: number;
}): JurisdictionAnalysis {
  const {
    stateCode, localTaxEnabled, localTaxJurisdiction,
    partialYearResident, partialYearStates,
    netProfit, grossIncome, tipIncomeAmount,
  } = params;

  const rules: StateRuleResult[] = [];
  const filingComponents: string[] = ["Federal 1040 + Schedule C + Schedule SE"];

  const stateConfig = stateCode ? getStateConfig(stateCode) : null;
  const stateTaxResult = stateCode
    ? calculateStateTax(stateCode, netProfit)
    : calculateStateTax("", 0);

  const taxType = stateTaxResult.taxType;
  const hasIncomeTax = stateCode ? !NO_INCOME_TAX_STATES.includes(stateCode) : false;
  const cfsfEligible = hasIncomeTax;

  if (stateCode && taxType === "None") {
    rules.push({
      code: "STATE_BYPASS",
      label: "No State Income Tax",
      severity: "info",
      message: `${stateConfig?.name || stateCode} has no state income tax. Your $50 covers 100% of your tax obligations — no hidden state fees.`,
    });
  }

  if (stateCode && hasIncomeTax) {
    filingComponents.push(`State CF/SF Auto-Forward (${stateCode})`);
  }

  if (stateCode && taxType === "Flat" && hasIncomeTax) {
    rules.push({
      code: "FLAT_TAX_CALCULATION",
      label: `${stateCode} Flat Tax`,
      severity: "info",
      message: `${stateConfig?.name || stateCode} charges a flat ${stateTaxResult.topRate}% rate. Estimated state tax: $${stateTaxResult.taxOwed.toFixed(2)} on your Schedule C Line 31 net profit.`,
      details: { rate: stateTaxResult.topRate, estimate: stateTaxResult.taxOwed },
    });
  }

  if (stateCode && taxType === "Graduated" && hasIncomeTax) {
    rules.push({
      code: "GRADUATED_TAX_CALCULATION",
      label: `${stateCode} Graduated Tax`,
      severity: "info",
      message: `${stateConfig?.name || stateCode} uses graduated brackets (top rate ${stateTaxResult.topRate}%). Effective rate: ${stateTaxResult.effectiveRate}%. Estimated state tax: $${stateTaxResult.taxOwed.toFixed(2)}.`,
      details: {
        topRate: stateTaxResult.topRate,
        effectiveRate: stateTaxResult.effectiveRate,
        estimate: stateTaxResult.taxOwed,
        brackets: stateTaxResult.brackets,
      },
    });
  }

  if (stateCode && taxType === "Decoupled") {
    rules.push({
      code: "DECOUPLED_STATE",
      label: `${stateCode} Decoupled Rules`,
      severity: "warning",
      message: `${stateConfig?.name || stateCode} has decoupled from certain federal rules. A State Adjustment review may be required (e.g., vehicle depreciation limits differ from federal). Estimated state tax: $${stateTaxResult.taxOwed.toFixed(2)}.`,
      details: {
        decoupledRules: stateTaxResult.decoupledRules,
        requiresAdjustment: stateTaxResult.requiresStateAdjustment,
      },
    });
  }

  if (stateCode === "CA" && grossIncome < 32900) {
    rules.push({
      code: "CALEITC_ELIGIBLE",
      label: "CalEITC Eligibility",
      severity: "action",
      message: `Your gross income ($${grossIncome.toFixed(2)}) is below the $32,900 CalEITC threshold. You may qualify for the California Earned Income Tax Credit (Form FTB 3514). Consider filing to claim this credit.`,
      details: { threshold: 32900, form: "FTB 3514" },
    });
  }

  if (stateCode === "NY" && localTaxEnabled && localTaxJurisdiction === "NYC") {
    const nycRate = grossIncome <= 12000 ? 3.078
      : grossIncome <= 25000 ? 3.762
      : grossIncome <= 50000 ? 3.819
      : 3.876;
    const nycSurcharge = netProfit * (nycRate / 100);
    rules.push({
      code: "NYC_SURCHARGE",
      label: "NYC Resident Tax",
      severity: "warning",
      message: `NYC resident surcharge of ${nycRate}% applies. Estimated additional tax: $${nycSurcharge.toFixed(2)} on your net profit.`,
      details: { rate: nycRate, estimate: nycSurcharge },
    });
  }

  if (stateCode === "IL" && grossIncome >= 1000) {
    rules.push({
      code: "IL_LOW_THRESHOLD",
      label: "Illinois Low Filing Threshold",
      severity: "warning",
      message: `Illinois requires state filing for income over $1,000 (vs. $20,000+ federal threshold). You earned $${grossIncome.toFixed(2)} — state filing is mandatory.`,
      details: { stateThreshold: 1000, federalThreshold: 20000 },
    });
  }

  if (stateCode === "PA" && localTaxEnabled && (localTaxJurisdiction === "KEYSTONE_PA" || localTaxJurisdiction === "PHL" || localTaxJurisdiction === "PIT")) {
    rules.push({
      code: "PA_KEYSTONE",
      label: "PA Local EIT (Keystone Collections)",
      severity: "action",
      message: `Pennsylvania local earned income tax requires electronic filing through Keystone Collections Group. Your Local EIT Worksheet will be generated for upload.`,
      details: { provider: "Keystone Collections Group", portal: "https://www.keystonecollects.com/" },
    });
  }

  const noTaxOnTipsEligible = tipIncomeAmount > 0;
  const tipsDecoupled = stateCode ? NO_TAX_ON_TIPS_DECOUPLED_STATES.includes(stateCode) : false;
  let federalTipExemption = 0;
  let stateTipInclusion = 0;

  if (noTaxOnTipsEligible) {
    federalTipExemption = tipIncomeAmount;
    rules.push({
      code: "NO_TAX_ON_TIPS_FEDERAL",
      label: "No Tax on Tips (2026 OBBBA)",
      severity: "info",
      message: `Under the 2026 One Big Beautiful Bill Act, $${tipIncomeAmount.toFixed(2)} in tip income is exempt from federal income tax.`,
      details: { exemptAmount: tipIncomeAmount },
    });

    if (tipsDecoupled) {
      stateTipInclusion = tipIncomeAmount;
      rules.push({
        code: "TIPS_STATE_DECOUPLED",
        label: "State Decouples from Federal Tip Rule",
        severity: "warning",
        message: `${stateCode} has not adopted the federal "No Tax on Tips" provision. Your $${tipIncomeAmount.toFixed(2)} in tips will be added back to state taxable income to avoid a state audit letter.`,
        details: { state: stateCode, includedAmount: tipIncomeAmount },
      });
    }
  }

  if (partialYearResident && partialYearStates.length > 0) {
    rules.push({
      code: "PARTIAL_YEAR_RESIDENT",
      label: "Partial-Year Residency",
      severity: "warning",
      message: `You lived in ${partialYearStates.length + 1} state(s) during 2026 (${[stateCode, ...partialYearStates].filter(Boolean).join(", ")}). Income may need to be apportioned across states. Consult a tax professional for multi-state filing.`,
      details: { states: [stateCode, ...partialYearStates] },
    });
  }

  const localJurisdictionInfo = localTaxJurisdiction ? HIGH_LOCAL_TAX_JURISDICTIONS[localTaxJurisdiction] : null;
  const localRate = localJurisdictionInfo?.rate ?? null;
  const localTaxEstimate = localRate ? Math.round(netProfit * (localRate / 100) * 100) / 100 : null;

  if (localTaxEnabled && localJurisdictionInfo) {
    filingComponents.push(`Local EIT Statement (${localJurisdictionInfo.name})`);
  }

  filingComponents.push("7-Year Vault Archiving");

  return {
    stateCode: stateCode || "",
    stateName: stateConfig?.name || "",
    taxType,
    bucketLabel: stateTaxResult.bucketLabel,
    hasIncomeTax,
    cfsfEligible,
    stateTaxRate: stateTaxResult.topRate || null,
    effectiveRate: stateTaxResult.effectiveRate,
    stateTaxOwed: stateTaxResult.taxOwed,
    stateRules: rules,
    noTaxOnTipsEligible,
    tipsDecoupled,
    federalTipExemption,
    stateTipInclusion,
    localTaxEnabled,
    localJurisdiction: localTaxJurisdiction,
    localRate,
    localTaxEstimate,
    filingComponents,
    requiresStateAdjustment: stateTaxResult.requiresStateAdjustment,
    decoupledRules: stateTaxResult.decoupledRules,
    stateTaxResult,
  };
}

export function getSubmissionReadinessChecklist(analysis: JurisdictionAnalysis): {
  label: string;
  included: boolean;
  description: string;
}[] {
  const checklist = [
    {
      label: "Federal 1040 & Schedule C",
      included: true,
      description: analysis.noTaxOnTipsEligible
        ? "Includes 'No Tax on Tips' (OBBBA 2026) logic."
        : "Full Schedule C Profit/Loss + Schedule SE.",
    },
    {
      label: `State Form (${analysis.stateCode || "Not Set"})`,
      included: analysis.hasIncomeTax && analysis.cfsfEligible,
      description: analysis.hasIncomeTax
        ? `${analysis.bucketLabel} — ${analysis.stateName} at ${analysis.effectiveRate}% effective rate via CF/SF auto-forwarding.`
        : analysis.stateCode
          ? `${analysis.stateName} has no state income tax — no state form needed. Your $50 covers 100%.`
          : "Select your state in Tax Profile to configure.",
    },
    {
      label: `Local Worksheet${analysis.localJurisdiction ? ` (${analysis.localJurisdiction})` : ""}`,
      included: analysis.localTaxEnabled && !!analysis.localJurisdiction,
      description: analysis.localTaxEnabled && analysis.localJurisdiction
        ? `Local EIT Statement for ${analysis.localJurisdiction} drivers.`
        : "Enable local tax in settings if your city requires it.",
    },
    {
      label: "7-Year Vault Archiving",
      included: true,
      description: "Immutable storage of all receipts, logs, and tax documents.",
    },
  ];

  if (analysis.requiresStateAdjustment) {
    checklist.splice(2, 0, {
      label: `State Adjustment (${analysis.stateCode})`,
      included: true,
      description: `${analysis.stateName} requires review of vehicle depreciation and deduction limits that differ from federal rules.`,
    });
  }

  return checklist;
}
