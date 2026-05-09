/**
 * Single source for jurisdiction-facing labels used across UI (avoid HMRC vs IRS leakage).
 */

export type RegionType =
  | "US"
  | "UK"
  | "CA"
  | "MX"
  | "NO"
  | "SE"
  | "DK"
  | "EU"
  | "MY"
  | "CN"
  | "ID"
  | "BR"
  | "ZA"
  | "NG"
  | "OTHER";

/** HMRC Approved Mileage Payments — cars/vans: 45p first 10,000 business miles, 25p above (gov.uk). */
export const HMRC_MILEAGE_FIRST_BAND_MILES = 10_000;
export const HMRC_MILEAGE_RATE_FIRST_BAND_GBP = 0.45;
export const HMRC_MILEAGE_RATE_ABOVE_BAND_GBP = 0.25;

/** US UI headline rate requested by product brief ($0.70 ≈ IRS illustrative vs statutory IRS Notice figure elsewhere). */
export const US_STANDARD_MILEAGE_RATE_UI_USD = 0.7;

export interface RegionalTaxStrings {
  appConsentBrandLine: string;
  mileageComplianceShort: string;
  mileageDeductionLabel: string;
  grossIncomeReportingHint: string;
  primaryEstimatedPayments: string;
  secondaryDeadlineNote: string;
  legalDisclaimerAuthority: string;
  limitationAuthorityPrefix: string;
  privacyHeading: string;
  privacyBullets: string[];
  dataRetentionHeading: string;
  dataRetentionBody: string;
  arbitrationHeading: string;
  arbitrationBody: string;
  tipsComplianceNote: string;
}

function ukStrings(): RegionalTaxStrings {
  return {
    appConsentBrandLine: "My Cab Tax is a bookkeeping tool only — not tax advice.",
    mileageComplianceShort:
      "HMRC Approved Mileage Payments — 45p/mile for the first 10,000 business miles.",
    mileageDeductionLabel: "Approved mileage (estimate)",
    grossIncomeReportingHint:
      "Platform payouts & statements should align with your Self Assessment records (no US 1099‑K forms).",
    primaryEstimatedPayments:
      "Payments on account — typically 31 July (second instalment on account).",
    secondaryDeadlineNote:
      "Self Assessment online filing deadline — typically 31 January following the tax year end.",
    legalDisclaimerAuthority:
      "Consult a qualified accountant or tax adviser before submitting figures to HMRC.",
    limitationAuthorityPrefix: "HMRC investigations",
    privacyHeading: "Privacy & Data Protection (UK GDPR-aligned)",
    privacyBullets: [
      "We collect only what we need to run your vault and filings.",
      "Industry-standard encryption in transit and at rest.",
      "You may request export or erasure subject to lawful retention needs.",
    ],
    dataRetentionHeading: "Record retention",
    dataRetentionBody:
      "HMRC generally expects Self Assessment records to be kept at least 5 years after the 31 January deadline for that year. Pro subscribers get extended vault retention aligned with commercial backups.",
    arbitrationHeading: "Dispute resolution",
    arbitrationBody:
      "These Terms are governed by applicable UK consumer and contract law. Where arbitration applies, it will be on an individual basis under rules communicated in the full Terms.",
    tipsComplianceNote:
      "Tip treatment depends on your circumstances; confirm with your adviser or HMRC guidance.",
  };
}

function usStrings(): RegionalTaxStrings {
  return {
    appConsentBrandLine: "My Cab Tax USA is a bookkeeping tool only — not tax advice.",
    mileageComplianceShort:
      "IRS mileage tracking aligned with Publication 463 for contemporaneous logs.",
    mileageDeductionLabel: "Standard mileage deduction (estimate)",
    grossIncomeReportingHint:
      "Reconcile gross fares vs payouts using platform statements and Form 1099‑K / 1099‑NEC where applicable.",
    primaryEstimatedPayments:
      "Federal estimated tax — typical deadlines include mid‑April, mid‑June, mid‑September, and mid‑January.",
    secondaryDeadlineNote:
      "State deadlines vary; confirm with your state tax authority.",
    legalDisclaimerAuthority:
      "Consult a qualified CPA or tax attorney before submitting returns to the IRS.",
    limitationAuthorityPrefix: "IRS audits",
    privacyHeading: "Privacy Policy (GLBA & CCPA-aware)",
    privacyBullets: [
      "We collect name, email, and financial data you enter to provide the service.",
      "Industry-standard encryption; MFA via Auth0 where enabled.",
      "California residents may have additional rights under CCPA.",
    ],
    dataRetentionHeading: "7‑year secure retention",
    dataRetentionBody:
      "Pro Tax Vault targets seven‑year retention for audit‑ready records; free tier retention is shorter — see full Terms.",
    arbitrationHeading: "Mandatory arbitration (Section 1.7)",
    arbitrationBody:
      "Individual binding arbitration under AAA rules (Delaware law) unless small‑claims court applies.",
    tipsComplianceNote:
      "2026 federal guidance may exempt qualifying tips from federal income tax — confirm eligibility.",
  };
}

function caStrings(): RegionalTaxStrings {
  const base = usStrings();
  return {
    ...base,
    appConsentBrandLine: "My Cab Tax is a bookkeeping tool only — not tax advice.",
    mileageComplianceShort:
      "Track contemporaneous business kilometres — confirm CRA prescribed rates for your tax year.",
    grossIncomeReportingHint:
      "Align payouts with T4/T2125 reporting where applicable; consult CRA guidance.",
    legalDisclaimerAuthority:
      "Consult a qualified Canadian tax professional before filing with the CRA.",
    limitationAuthorityPrefix: "CRA reviews",
  };
}

export function regionalTaxStrings(region: RegionType): RegionalTaxStrings {
  if (region === "UK") return ukStrings();
  if (region === "CA") return caStrings();
  return usStrings();
}

/** Normalize alpha‑2 for comparisons (UK → GB). */
export function normalizeDetectedCountry(iso: string | null | undefined): string {
  const c = (iso ?? "").trim().toUpperCase();
  return c === "UK" ? "GB" : c;
}

/**
 * Coarse “master switch” bucket so VPN/IP transitions reload only when tax UX materially changes.
 */
export type FiscalUxBucket = "UK" | "US_CA" | "OTHER";

export function fiscalUxBucketFromCountry(iso: string | null | undefined): FiscalUxBucket {
  const n = normalizeDetectedCountry(iso);
  if (n === "GB") return "UK";
  if (n === "US" || n === "CA") return "US_CA";
  return "OTHER";
}

/** HMRC-style mileage allowance (cars/vans, simplified). */
export function calculateHmrcMileageAllowanceGbp(totalBusinessMiles: number): number {
  const miles = Math.max(0, totalBusinessMiles);
  const first = Math.min(miles, HMRC_MILEAGE_FIRST_BAND_MILES);
  const rest = Math.max(0, miles - HMRC_MILEAGE_FIRST_BAND_MILES);
  return first * HMRC_MILEAGE_RATE_FIRST_BAND_GBP + rest * HMRC_MILEAGE_RATE_ABOVE_BAND_GBP;
}
