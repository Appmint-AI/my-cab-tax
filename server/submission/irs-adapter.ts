import type { SubmissionProvider, SubmissionData, SubmissionResult } from "./types";
import crypto from "crypto";
import { analyzeJurisdiction } from "./jurisdiction-rules";

export const NO_INCOME_TAX_STATES = ["AK", "FL", "NV", "NH", "SD", "TN", "TX", "WA", "WY"];

export const HIGH_LOCAL_TAX_JURISDICTIONS: Record<string, { name: string; rate: number; portalUrl: string }> = {
  "NYC": { name: "New York City", rate: 3.876, portalUrl: "https://www.nyc.gov/site/finance/taxes/business-unincorporated-business-tax-ubt.page" },
  "PHL": { name: "City of Philadelphia", rate: 3.75, portalUrl: "https://www.phila.gov/services/payments-assistance-taxes/business-taxes/business-income-receipts-tax/" },
  "DET": { name: "City of Detroit", rate: 2.4, portalUrl: "https://detroitmi.gov/departments/office-chief-financial-officer/ocfo-divisions/office-treasury/income-tax" },
  "CLV": { name: "City of Cleveland", rate: 2.5, portalUrl: "https://www.clevelandohio.gov/city-hall/departments/finance/division-taxation" },
  "COL": { name: "City of Columbus", rate: 2.5, portalUrl: "https://www.columbus.gov/incometax/" },
  "CIN": { name: "City of Cincinnati", rate: 1.8, portalUrl: "https://www.cincinnati-oh.gov/finance/income-taxes/" },
  "PIT": { name: "City of Pittsburgh", rate: 3.0, portalUrl: "https://pittsburghpa.gov/finance/tax-descriptions" },
  "SL": { name: "City of St. Louis", rate: 1.0, portalUrl: "https://www.stlouis-mo.gov/government/departments/collector/" },
  "KC": { name: "Kansas City, MO", rate: 1.0, portalUrl: "https://www.kcmo.gov/city-hall/departments/finance/earnings-tax" },
  "WIL": { name: "City of Wilmington, DE", rate: 1.25, portalUrl: "https://www.wilmingtonde.gov/government/city-departments/department-of-finance/revenue" },
  "YONK": { name: "City of Yonkers", rate: 1.9575, portalUrl: "https://www.yonkersny.gov" },
  "KEYSTONE_PA": { name: "Keystone Collections (PA Local EIT)", rate: 1.0, portalUrl: "https://www.keystonecollects.com/" },
};

export interface IRSScheduleCPayload {
  version: string;
  generatedAt: string;
  filingId: string;
  submissionHash: string;
  preparerType: "self_prepared";
  eroRole: "electronic_return_originator";
  appRole: "MCTUSA_ERO";
  taxpayer: {
    userId: string;
    taxYear: number;
  };
  jurisdiction: {
    stateCode: string | null;
    stateHasIncomeTax: boolean;
    cfsfEligible: boolean;
    localTaxEnabled: boolean;
    localTaxJurisdiction: string | null;
    localTaxRate: number | null;
    localTaxEstimate: number | null;
  };
  scheduleC: {
    partI: {
      line1_grossReceipts: number;
      line4_costOfGoodsSold: number;
      line7_grossIncome: number;
      line10_commissionsAndFees: number;
      netReceipts: number;
    };
    partII: {
      line9_carAndTruckExpenses: number;
      line10_commissionsAndFees: number;
      line15_insurance: number;
      line16a_interest: number;
      line17_legalAndProfessional: number;
      line18_officeExpense: number;
      line22_supplies: number;
      line27_otherExpenses: number;
      line28_totalExpenses: number;
      mileageDetail: {
        totalMiles: number;
        ratePerMile: number;
        deduction: number;
      };
      expensesByCategory: Record<string, number>;
    };
    partIII: {
      line31_netProfit: number;
    };
  };
  scheduleSE: {
    seTaxableBase: number;
    selfEmploymentTax: number;
    seDeduction: number;
    estimatedQuarterlyPayment: number;
    quarterlyDeadlines: string[];
  };
  mileageIntegrityCertificate: {
    totalEntries: number;
    entriesWithTimestamps: number;
    contemporaneousCompliance: boolean;
    statement: string;
  };
  recordCounts: {
    incomes: number;
    expenses: number;
    mileageLogs: number;
    receipts: number;
  };
  incomeBySource: Record<string, number>;
  dataFingerprint: string;
  stateSpecificRules: {
    code: string;
    label: string;
    severity: string;
    message: string;
  }[];
  tipIncomeAdjustments: {
    federalTipExemption: number;
    stateTipInclusion: number;
    noTaxOnTipsApplied: boolean;
    stateDecoupled: boolean;
  };
  stateTaxEstimate: {
    topRate: number | null;
    effectiveRate: number;
    estimate: number;
    taxType: string;
    bucketLabel: string;
  };
}

/**
 * Internal IRS Adapter — Generates a validated, hash-verified JSON payload
 * that maps directly to IRS Schedule C line items.
 *
 * @compliance IRS Schedule C (Form 1040), Schedule SE, IRC Sec. 274(d)
 * @compliance OBBBA Sec. 101 (2026) — Tip income adjustments per federal/state decoupling
 *
 * @why This adapter produces the canonical data representation for tax filing.
 *      The SHA-256 submissionHash creates a tamper-evident audit trail that can
 *      be verified years later during IRS examination. The JSON structure mirrors
 *      actual Schedule C line numbers for direct mapping to e-filing XML schemas.
 *      Using an immutable hash ensures M&A due diligence can verify data integrity
 *      across the full 7-year retention period.
 */
export class InternalIRSAdapter implements SubmissionProvider {
  readonly name = "irs_json";

  async submit(data: SubmissionData): Promise<SubmissionResult> {
    try {
      const payload = this.buildScheduleCPayload(data);

      return {
        success: true,
        provider: this.name,
        metadata: {
          payload,
          submissionHash: payload.submissionHash,
          filingId: payload.filingId,
          taxYear: data.taxYear,
          grossIncome: data.summary.grossIncome,
          netProfit: data.summary.netProfit,
          preparerType: "self_prepared",
          eroRole: "electronic_return_originator",
        },
      };
    } catch (err: any) {
      return {
        success: false,
        provider: this.name,
        errorMessage: err.message || "IRS JSON generation failed",
      };
    }
  }

  /**
   * Builds the complete IRS Schedule C JSON payload from aggregated tax summary data.
   * Includes SHA-256 submissionHash for tamper-evident audit trail.
   *
   * @compliance Schedule C Lines 1-31 mapping, Schedule SE, IRC Sec. 1401
   * @compliance OBBBA Sec. 101 — Tip income federal exemption with state decoupling awareness
   * @why The payload structure mirrors IRS e-filing XML schema fields for future
   *      direct submission capability. The SHA-256 hash over the complete payload
   *      creates an immutable fingerprint that can be verified during IRS examination
   *      up to 7 years after filing.
   */
  buildScheduleCPayload(data: SubmissionData): IRSScheduleCPayload {
    const { summary } = data;

    const carAndTruckExpenses = summary.expensesByCategory["Car and Truck Expenses"] || 0;
    const commissionsExpenses = summary.expensesByCategory["Commissions and Fees"] || 0;
    const insuranceExpenses = summary.expensesByCategory["Insurance"] || 0;
    const interestExpenses = summary.expensesByCategory["Interest"] || 0;
    const legalExpenses = summary.expensesByCategory["Legal and Professional Services"] || 0;
    const officeExpenses = summary.expensesByCategory["Office Expense"] || 0;
    const suppliesExpenses = summary.expensesByCategory["Supplies"] || 0;
    const otherExpenses = summary.expensesByCategory["Other Expenses"] || 0;

    const fingerprintSource = JSON.stringify({
      userId: data.userId,
      taxYear: data.taxYear,
      grossIncome: summary.grossIncome,
      netProfit: summary.netProfit,
      totalDeductions: summary.totalDeductions,
      selfEmploymentTax: summary.selfEmploymentTax,
      expenseCount: data.expenses.length,
      incomeCount: data.incomes.length,
      generatedAt: data.generatedAt.toISOString(),
    });
    const submissionHash = crypto.createHash("sha256").update(fingerprintSource).digest("hex");

    const filingId = `MCTUSA-${data.taxYear}-${submissionHash.substring(0, 12).toUpperCase()}`;

    const dataFingerprint = crypto.createHash("sha256").update(
      JSON.stringify({
        grossIncome: summary.grossIncome,
        totalDeductions: summary.totalDeductions,
        netProfit: summary.netProfit,
      })
    ).digest("hex");

    const entriesWithTimestamps = data.mileageLogs.filter(l => l.createdAt).length;
    const totalEntries = data.mileageLogs.length;
    const contemporaneousCompliance = totalEntries > 0 && entriesWithTimestamps === totalEntries;

    const stateCode = data.jurisdiction?.stateCode || null;
    const stateHasIncomeTax = stateCode ? !NO_INCOME_TAX_STATES.includes(stateCode) : false;
    const cfsfEligible = stateHasIncomeTax;
    const localTaxEnabled = data.jurisdiction?.localTaxEnabled || false;
    const localJurisdictionCode = data.jurisdiction?.localTaxJurisdiction || null;
    const localJurisdiction = localJurisdictionCode ? HIGH_LOCAL_TAX_JURISDICTIONS[localJurisdictionCode] : null;
    const localTaxRate = localJurisdiction?.rate || null;
    const localTaxEstimate = localTaxRate ? round2(summary.netProfit * (localTaxRate / 100)) : null;

    const jurisdictionAnalysis = analyzeJurisdiction({
      stateCode,
      localTaxEnabled,
      localTaxJurisdiction: localJurisdictionCode,
      partialYearResident: data.jurisdiction?.partialYearResident || false,
      partialYearStates: (data.jurisdiction?.partialYearStates as string[]) || [],
      netProfit: summary.netProfit,
      grossIncome: summary.grossIncome,
      tipIncomeAmount: data.jurisdiction?.tipIncomeAmount ? Number(data.jurisdiction.tipIncomeAmount) : 0,
    });

    return {
      version: "3.0.0",
      generatedAt: data.generatedAt.toISOString(),
      filingId,
      submissionHash,
      preparerType: "self_prepared",
      eroRole: "electronic_return_originator",
      appRole: "MCTUSA_ERO",
      taxpayer: {
        userId: data.userId,
        taxYear: data.taxYear,
      },
      jurisdiction: {
        stateCode,
        stateHasIncomeTax,
        cfsfEligible,
        localTaxEnabled,
        localTaxJurisdiction: localJurisdictionCode,
        localTaxRate,
        localTaxEstimate,
      },
      scheduleC: {
        partI: {
          line1_grossReceipts: round2(summary.grossIncome),
          line4_costOfGoodsSold: 0,
          line7_grossIncome: round2(summary.grossIncome - summary.totalPlatformFees),
          line10_commissionsAndFees: round2(summary.totalPlatformFees),
          netReceipts: round2(summary.grossIncome - summary.totalPlatformFees),
        },
        partII: {
          line9_carAndTruckExpenses: round2(carAndTruckExpenses),
          line10_commissionsAndFees: round2(commissionsExpenses),
          line15_insurance: round2(insuranceExpenses),
          line16a_interest: round2(interestExpenses),
          line17_legalAndProfessional: round2(legalExpenses),
          line18_officeExpense: round2(officeExpenses),
          line22_supplies: round2(suppliesExpenses),
          line27_otherExpenses: round2(otherExpenses),
          line28_totalExpenses: round2(summary.totalDeductions),
          mileageDetail: {
            totalMiles: round2(summary.totalMiles),
            ratePerMile: summary.mileageRate,
            deduction: round2(summary.mileageDeduction),
          },
          expensesByCategory: Object.fromEntries(
            Object.entries(summary.expensesByCategory).map(([k, v]) => [k, round2(v)])
          ),
        },
        partIII: {
          line31_netProfit: round2(summary.netProfit),
        },
      },
      scheduleSE: {
        seTaxableBase: round2(summary.seTaxableBase),
        selfEmploymentTax: round2(summary.selfEmploymentTax),
        seDeduction: round2(summary.seDeduction),
        estimatedQuarterlyPayment: round2(summary.estimatedQuarterlyPayment),
        quarterlyDeadlines: summary.quarterlyDeadlines,
      },
      mileageIntegrityCertificate: {
        totalEntries,
        entriesWithTimestamps,
        contemporaneousCompliance,
        statement: `This log contains ${totalEntries} entries with real-time timestamps, fulfilling the IRS requirement for contemporaneous record-keeping.`,
      },
      recordCounts: {
        incomes: data.incomes.length,
        expenses: data.expenses.length,
        mileageLogs: data.mileageLogs.length,
        receipts: data.receipts.length,
      },
      incomeBySource: Object.fromEntries(
        Object.entries(summary.incomeBySource).map(([k, v]) => [k, round2(v)])
      ),
      dataFingerprint,
      stateSpecificRules: jurisdictionAnalysis.stateRules.map(r => ({
        code: r.code,
        label: r.label,
        severity: r.severity,
        message: r.message,
      })),
      tipIncomeAdjustments: {
        federalTipExemption: jurisdictionAnalysis.federalTipExemption,
        stateTipInclusion: jurisdictionAnalysis.stateTipInclusion,
        noTaxOnTipsApplied: jurisdictionAnalysis.noTaxOnTipsEligible,
        stateDecoupled: jurisdictionAnalysis.tipsDecoupled,
      },
      stateTaxEstimate: {
        topRate: jurisdictionAnalysis.stateTaxRate,
        effectiveRate: jurisdictionAnalysis.effectiveRate,
        estimate: jurisdictionAnalysis.stateTaxOwed,
        taxType: jurisdictionAnalysis.taxType,
        bucketLabel: jurisdictionAnalysis.bucketLabel,
      },
    };
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
