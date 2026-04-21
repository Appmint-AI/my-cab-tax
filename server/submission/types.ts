import type { TaxSummary, MileageLog, Expense, Income, Receipt } from "@shared/schema";

/**
 * SubmissionData contains all validated tax data needed to generate
 * an IRS-ready submission. This is the "canonical" payload that any
 * SubmissionProvider can consume.
 *
 * FUTURE API INTEGRATION NOTE:
 * When building the EFileProvider, read this data structure from the
 * vault PDF metadata or from the database directly. The shape is stable
 * and mirrors IRS Schedule C line items.
 */
export interface SubmissionData {
  userId: string;
  taxYear: number;
  generatedAt: Date;
  summary: TaxSummary;
  mileageLogs: MileageLog[];
  expenses: Expense[];
  incomes: Income[];
  receipts: Receipt[];
  jurisdiction?: {
    stateCode: string | null;
    localTaxEnabled: boolean;
    localTaxJurisdiction: string | null;
    partialYearResident?: boolean;
    partialYearStates?: string[] | unknown;
    tipIncomeAmount?: string | null;
  };
}

/**
 * SubmissionResult is returned by every provider after processing.
 */
export interface SubmissionResult {
  success: boolean;
  provider: string;
  vaultPath?: string;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}

/**
 * SubmissionProvider is the adapter interface.
 * Each provider implements `submit()` to handle data in its own way.
 *
 * Phase 1: VaultPDFProvider  — generates a validated IRS Audit PDF → GCS Vault
 * Phase 2: EFileProvider     — will transmit XML/API payload to the IRS
 *
 * INTEGRATION GUIDE FOR FUTURE DEVELOPERS:
 * 1. Implement the SubmissionProvider interface
 * 2. Read validated data from SubmissionData (same shape as vault PDF)
 * 3. Register your provider in SubmissionService
 * 4. The SubmissionService handles audit logging and error handling
 */
export interface SubmissionProvider {
  readonly name: string;
  submit(data: SubmissionData): Promise<SubmissionResult>;
}
