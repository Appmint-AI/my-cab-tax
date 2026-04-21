import { storage } from "../storage";
import type { SubmissionProvider, SubmissionData, SubmissionResult } from "./types";
import { VaultPDFProvider } from "./vault-pdf-provider";
import { EFileProvider } from "./efile-provider";
import { InternalIRSAdapter } from "./irs-adapter";
import { LocalTaxProvider } from "./local-tax-provider";

export type { SubmissionData, SubmissionResult, SubmissionProvider } from "./types";
export { InternalIRSAdapter } from "./irs-adapter";

/**
 * SubmissionService — Orchestrator for all submission providers.
 *
 * Uses the adapter pattern: register any number of SubmissionProviders,
 * then call submitTo(providerName) to route data through the correct one.
 *
 * ARCHITECTURE FOR FUTURE DEVELOPERS:
 * ┌─────────────────────┐
 * │  SubmissionService   │ ← orchestrator (this file)
 * │                     │
 * │  providers:         │
 * │   ├─ vault_pdf      │ ← Phase 1: PDF → GCS Vault (ACTIVE)
 * │   └─ efile_irs      │ ← Phase 2: XML → IRS API  (PLACEHOLDER)
 * └─────────────────────┘
 *
 * To add a new provider:
 * 1. Create a class implementing SubmissionProvider
 * 2. Register it in the constructor below
 * 3. Call submissionService.submitTo("your_provider_name", userId)
 */
export class SubmissionService {
  private providers = new Map<string, SubmissionProvider>();

  constructor() {
    this.registerProvider(new VaultPDFProvider());
    this.registerProvider(new EFileProvider());
    this.registerProvider(new InternalIRSAdapter());
    this.registerProvider(new LocalTaxProvider());
  }

  registerProvider(provider: SubmissionProvider): void {
    this.providers.set(provider.name, provider);
  }

  getAvailableProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  async buildSubmissionData(userId: string): Promise<SubmissionData> {
    const [summary, expenses, incomes, mileageLogs, receipts, user] = await Promise.all([
      storage.getTaxSummary(userId),
      storage.getExpenses(userId),
      storage.getIncomes(userId),
      storage.getMileageLogs(userId),
      storage.getReceipts(userId),
      storage.getUser(userId),
    ]);

    return {
      userId,
      taxYear: new Date().getFullYear(),
      generatedAt: new Date(),
      summary,
      mileageLogs,
      expenses,
      incomes,
      receipts,
      jurisdiction: {
        stateCode: user?.stateCode || null,
        localTaxEnabled: user?.localTaxEnabled || false,
        localTaxJurisdiction: user?.localTaxJurisdiction || null,
        partialYearResident: user?.partialYearResident || false,
        partialYearStates: (user?.partialYearStates as string[]) || [],
        tipIncomeAmount: user?.tipIncomeAmount || null,
      },
    };
  }

  async submitTo(
    providerName: string,
    userId: string,
    options?: { ipAddress?: string; userAgent?: string }
  ): Promise<SubmissionResult> {
    const provider = this.providers.get(providerName);
    if (!provider) {
      return {
        success: false,
        provider: providerName,
        errorMessage: `Unknown submission provider: ${providerName}`,
      };
    }

    const data = await this.buildSubmissionData(userId);
    const result = await provider.submit(data);

    await storage.createAuditLog({
      userId,
      action: `submission.${providerName}`,
      ipAddress: options?.ipAddress || null,
      userAgent: options?.userAgent || null,
      metadata: {
        provider: providerName,
        success: result.success,
        vaultPath: result.vaultPath || null,
        taxYear: data.taxYear,
        grossIncome: data.summary.grossIncome,
        netProfit: data.summary.netProfit,
        errorMessage: result.errorMessage || null,
      },
    });

    return result;
  }
}

export const submissionService = new SubmissionService();
