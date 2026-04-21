import { pgTable, text, serial, integer, boolean, timestamp, numeric, date, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";
import { users } from "./models/auth";

export * from "./models/auth";
export * from "./models/chat";

/**
 * 2026 IRS Constants — Tax Year 2026
 *
 * @compliance IRS Notice 2026-01, Rev. Proc. 2026-XX
 * @why These constants are the single source of truth for all tax calculations.
 *      Centralizing them here ensures year-over-year updates are single-line
 *      changes with full downstream propagation to the tax engine, PDF exports,
 *      and frontend displays. Acquirers can verify each value against the cited
 *      IRS publications.
 */

/** @compliance IRS Notice 2026-01 — Standard mileage rate for business use of a vehicle. Up 2.5 cents from 2025 (70.0c). */
export const IRS_MILEAGE_RATE = 0.725;

/** @compliance IRC Sec. 1401 — Combined SE tax rate (12.4% OASDI + 2.9% Medicare). */
export const SE_TAX_RATE = 0.153;

/** @compliance IRC Sec. 1402(a)(12) — SE tax applies to 92.35% of net self-employment earnings. */
export const SE_TAXABLE_BASE = 0.9235;

/** @compliance IRS Rev. Proc. 2026-XX — Standard deduction for single filers, tax year 2026. */
export const STANDARD_DEDUCTION_2026 = 15700;

/** @compliance IRS Form 1040-ES — Quarterly estimated tax payment due dates for tax year 2026. */
export const QUARTERLY_DEADLINES = ["2026-04-15", "2026-06-15", "2026-09-15", "2027-01-15"];

/** @compliance IRC Sec. 6050W(e) — 2026 reverted 1099-K gross threshold ($20,000). The $600 threshold from the American Rescue Plan was delayed and reverted. */
export const FORM_1099K_THRESHOLD = 20000;

/** @compliance IRC Sec. 6050W(e) — 2026 reverted 1099-K transaction count threshold (200+). Both gross AND transaction thresholds must be met. */
export const FORM_1099K_TRANSACTION_THRESHOLD = 200;

/** @compliance TCJA Extension (2026) — SALT deduction cap raised from $10,000 to $40,000 for tax year 2026. Applies to state and local property taxes, including home office property tax allocation. */
export const SALT_DEDUCTION_CAP = 40000;

// Mileage methodology options per IRS rules
export const MILEAGE_METHODS = ["standard", "actual"] as const;
export type MileageMethod = typeof MILEAGE_METHODS[number];

// IRS Schedule C Expense Categories
export const IRS_EXPENSE_CATEGORIES = [
  "Car and Truck Expenses",
  "Commissions and Fees",
  "Home Office",
  "Insurance",
  "Interest",
  "Legal and Professional Services",
  "Office Expense",
  "Property Tax (SALT)",
  "Other Expenses",
] as const;

export type IRSExpenseCategory = typeof IRS_EXPENSE_CATEGORIES[number];

// Map legacy categories to IRS buckets
export const LEGACY_CATEGORY_MAP: Record<string, IRSExpenseCategory> = {
  "Gas": "Car and Truck Expenses",
  "Maintenance": "Car and Truck Expenses",
  "Car Wash": "Car and Truck Expenses",
  "Tolls": "Car and Truck Expenses",
  "Insurance": "Insurance",
  "Lease": "Interest",
  "Phone": "Office Expense",
  "Meals": "Other Expenses",
  "Other": "Other Expenses",
};

/**
 * Maps legacy or user-entered expense categories to IRS Schedule C line item categories.
 *
 * @compliance IRS Schedule C Part II — Expenses (Lines 8-27)
 * @why Ensures every expense is mapped to a valid IRS category for audit-proof reporting.
 *      Legacy categories from earlier app versions are forward-compatible via LEGACY_CATEGORY_MAP.
 */
export function mapToIRSCategory(category: string): IRSExpenseCategory {
  return LEGACY_CATEGORY_MAP[category] || (IRS_EXPENSE_CATEGORIES.includes(category as IRSExpenseCategory) ? category as IRSExpenseCategory : "Other Expenses");
}

// Vehicles table - multi-car management
export const vehicles = pgTable("vehicles", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  year: integer("year"),
  make: text("make"),
  model: text("model"),
  mileageMethod: text("mileage_method").notNull().default("standard"),
  initialOdometer: numeric("initial_odometer"),
  odometerPhotoUrl: text("odometer_photo_url"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Odometer check-ins - quarterly verification records
export const odometerCheckins = pgTable("odometer_checkins", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  vehicleId: integer("vehicle_id").notNull().references(() => vehicles.id),
  reading: numeric("reading").notNull(),
  photoUrl: text("photo_url"),
  readingDate: date("reading_date").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Audit notices - IRS letters uploaded by users
export const auditNotices = pgTable("audit_notices", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  imageUrl: text("image_url").notNull(),
  originalFilename: text("original_filename"),
  noticeType: text("notice_type"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Expenses table
export const expenses = pgTable("expenses", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  vehicleId: integer("vehicle_id").references(() => vehicles.id),
  date: date("date").notNull(),
  amount: numeric("amount").notNull(),
  category: text("category").notNull(),
  description: text("description"),
  receiptUrl: text("receipt_url"),
  anchorCurrency: text("anchor_currency"),
  anchoredUsdAmount: numeric("anchored_usd_amount"),
  anchoredAt: timestamp("anchored_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Incomes table - now with miles, platformFees, and tips tracking
export const incomes = pgTable("incomes", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  date: date("date").notNull(),
  amount: numeric("amount").notNull(),
  source: text("source").notNull(),
  description: text("description"),
  miles: numeric("miles").default("0"),
  platformFees: numeric("platform_fees").default("0"),
  payeeState: text("payee_state"),
  isTips: boolean("is_tips").notNull().default(false),
  anchorCurrency: text("anchor_currency"),
  anchoredUsdAmount: numeric("anchored_usd_amount"),
  anchoredAt: timestamp("anchored_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Mileage Logs table - IRS-compliant contemporaneous mileage records
export const mileageLogs = pgTable("mileage_logs", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  vehicleId: integer("vehicle_id").references(() => vehicles.id),
  date: date("date").notNull(),
  businessPurpose: text("business_purpose").notNull(),
  startOdometer: numeric("start_odometer"),
  endOdometer: numeric("end_odometer"),
  totalMiles: numeric("total_miles").notNull(),
  tripState: text("trip_state"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Receipts table - OCR-scanned receipt images with retention policy
export const receipts = pgTable("receipts", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  expenseId: integer("expense_id").references(() => expenses.id),
  imageUrl: text("image_url").notNull(),
  originalFilename: text("original_filename"),
  merchantName: text("merchant_name"),
  receiptDate: text("receipt_date"),
  totalAmount: numeric("total_amount"),
  ocrData: jsonb("ocr_data"),
  ocrConfidence: numeric("ocr_confidence"),
  retentionPolicy: text("retention_policy").notNull().default("basic"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Submission receipts - signed submission snapshots for audit trail
export const submissionReceipts = pgTable("submission_receipts", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  taxYear: integer("tax_year").notNull(),
  filingId: text("filing_id").notNull(),
  pinHash: text("pin_hash").notNull(),
  submissionHash: text("submission_hash").notNull(),
  preparerType: text("preparer_type").notNull().default("self_prepared"),
  eroRole: text("ero_role").notNull().default("electronic_return_originator"),
  snapshotData: jsonb("snapshot_data").notNull(),
  grossIncome: numeric("gross_income").notNull(),
  totalDeductions: numeric("total_deductions").notNull(),
  netProfit: numeric("net_profit").notNull(),
  selfEmploymentTax: numeric("self_employment_tax").notNull(),
  totalMiles: numeric("total_miles").notNull(),
  incomeCount: integer("income_count").notNull(),
  expenseCount: integer("expense_count").notNull(),
  mileageLogCount: integer("mileage_log_count").notNull(),
  receiptCount: integer("receipt_count").notNull(),
  ack1099kVerified: boolean("ack_1099k_verified").notNull(),
  ackFiguresReviewed: boolean("ack_figures_reviewed").notNull(),
  ackBookkeepingTool: boolean("ack_bookkeeping_tool").notNull(),
  ackStateVerified: boolean("ack_state_verified").notNull().default(false),
  affidavitAccepted: boolean("affidavit_accepted").notNull().default(false),
  affidavitText: text("affidavit_text"),
  filingStateCode: text("filing_state_code"),
  filingStateBucket: text("filing_state_bucket"),
  perjuryAccepted: boolean("perjury_accepted").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  signedAt: timestamp("signed_at").notNull().defaultNow(),
});

// Audit logs - tracks disclaimer acceptance, submissions, and other auditable actions
export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  action: text("action").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Legal consent audit log
export const legalConsentLogs = pgTable("legal_consent_logs", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  termsVersion: text("terms_version").notNull(),
  jurisdiction: text("jurisdiction").notNull().default("Delaware"),
  arbitrationAgreed: boolean("arbitration_agreed").notNull().default(true),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  consentTimestamp: timestamp("consent_timestamp").notNull().defaultNow(),
});

export const vehiclesRelations = relations(vehicles, ({ one, many }) => ({
  user: one(users, {
    fields: [vehicles.userId],
    references: [users.id],
  }),
  expenses: many(expenses),
  mileageLogs: many(mileageLogs),
  odometerCheckins: many(odometerCheckins),
}));

export const odometerCheckinsRelations = relations(odometerCheckins, ({ one }) => ({
  user: one(users, {
    fields: [odometerCheckins.userId],
    references: [users.id],
  }),
  vehicle: one(vehicles, {
    fields: [odometerCheckins.vehicleId],
    references: [vehicles.id],
  }),
}));

export const auditNoticesRelations = relations(auditNotices, ({ one }) => ({
  user: one(users, {
    fields: [auditNotices.userId],
    references: [users.id],
  }),
}));

export const mileageLogsRelations = relations(mileageLogs, ({ one }) => ({
  user: one(users, {
    fields: [mileageLogs.userId],
    references: [users.id],
  }),
  vehicle: one(vehicles, {
    fields: [mileageLogs.vehicleId],
    references: [vehicles.id],
  }),
}));

export const receiptsRelations = relations(receipts, ({ one }) => ({
  user: one(users, {
    fields: [receipts.userId],
    references: [users.id],
  }),
  expense: one(expenses, {
    fields: [receipts.expenseId],
    references: [expenses.id],
  }),
}));

export const submissionReceiptsRelations = relations(submissionReceipts, ({ one }) => ({
  user: one(users, {
    fields: [submissionReceipts.userId],
    references: [users.id],
  }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  user: one(users, {
    fields: [auditLogs.userId],
    references: [users.id],
  }),
}));

export const legalConsentLogsRelations = relations(legalConsentLogs, ({ one }) => ({
  user: one(users, {
    fields: [legalConsentLogs.userId],
    references: [users.id],
  }),
}));

// Tax Rate Cache - stores live API rates with 24hr TTL
export const taxRateCache = pgTable("tax_rate_cache", {
  id: serial("id").primaryKey(),
  stateCode: text("state_code").notNull(),
  jurisdiction: text("jurisdiction"),
  provider: text("provider").notNull().default("static"),
  rateData: jsonb("rate_data").notNull(),
  previousRate: numeric("previous_rate"),
  currentRate: numeric("current_rate"),
  rateChangePct: numeric("rate_change_pct"),
  fetchedAt: timestamp("fetched_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
});

// Compliance Alerts - rate changes, regulatory updates, sentinel findings
export const complianceAlerts = pgTable("compliance_alerts", {
  id: serial("id").primaryKey(),
  alertType: text("alert_type").notNull(),
  severity: text("severity").notNull().default("info"),
  title: text("title").notNull(),
  description: text("description").notNull(),
  source: text("source"),
  sourceUrl: text("source_url"),
  stateCode: text("state_code"),
  metadata: jsonb("metadata"),
  isRead: boolean("is_read").notNull().default(false),
  isDismissed: boolean("is_dismissed").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const taxRateCacheRelations = relations(taxRateCache, () => ({}));
export const complianceAlertsRelations = relations(complianceAlerts, () => ({}));

export type TaxRateCache = typeof taxRateCache.$inferSelect;
export type ComplianceAlert = typeof complianceAlerts.$inferSelect;

// Relations
export const expensesRelations = relations(expenses, ({ one }) => ({
  user: one(users, {
    fields: [expenses.userId],
    references: [users.id],
  }),
  vehicle: one(vehicles, {
    fields: [expenses.vehicleId],
    references: [vehicles.id],
  }),
}));

export const incomesRelations = relations(incomes, ({ one }) => ({
  user: one(users, {
    fields: [incomes.userId],
    references: [users.id],
  }),
}));

// Schemas
export const insertVehicleSchema = createInsertSchema(vehicles).omit({
  id: true,
  userId: true,
  createdAt: true,
}).extend({
  name: z.string().min(1, "Vehicle name is required"),
  year: z.coerce.number().min(1900).max(2100).optional().nullable(),
  mileageMethod: z.enum(MILEAGE_METHODS).default("standard"),
  initialOdometer: z.coerce.number().min(0).optional().nullable(),
  odometerPhotoUrl: z.string().optional().nullable(),
});

export const insertOdometerCheckinSchema = createInsertSchema(odometerCheckins).omit({
  id: true,
  userId: true,
  createdAt: true,
}).extend({
  reading: z.coerce.number().min(0, "Odometer reading must be positive"),
  vehicleId: z.coerce.number(),
});

export const insertAuditNoticeSchema = createInsertSchema(auditNotices).omit({
  id: true,
  userId: true,
  createdAt: true,
});

export const insertExpenseSchema = createInsertSchema(expenses).omit({ 
  id: true, 
  userId: true, 
  createdAt: true 
}).extend({
  amount: z.coerce.number().positive(),
  vehicleId: z.coerce.number().optional().nullable(),
});

export const insertIncomeSchema = createInsertSchema(incomes).omit({ 
  id: true, 
  userId: true, 
  createdAt: true 
}).extend({
  amount: z.coerce.number().positive(),
  miles: z.coerce.number().min(0).optional().default(0),
  platformFees: z.coerce.number().min(0).optional().default(0),
  isTips: z.boolean().optional().default(false),
});

export const insertMileageLogSchema = createInsertSchema(mileageLogs).omit({
  id: true,
  userId: true,
  createdAt: true,
}).extend({
  totalMiles: z.coerce.number().positive("Miles must be positive"),
  startOdometer: z.coerce.number().min(0).optional().nullable(),
  endOdometer: z.coerce.number().min(0).optional().nullable(),
  vehicleId: z.coerce.number().optional().nullable(),
});

export const insertReceiptSchema = createInsertSchema(receipts).omit({
  id: true,
  userId: true,
  createdAt: true,
}).extend({
  totalAmount: z.coerce.number().min(0).optional().nullable(),
  ocrConfidence: z.coerce.number().min(0).max(100).optional().nullable(),
});

// Types
export type AuditLog = typeof auditLogs.$inferSelect;
export type Receipt = typeof receipts.$inferSelect;
export type InsertReceipt = z.infer<typeof insertReceiptSchema>;
export type Vehicle = typeof vehicles.$inferSelect;
export type InsertVehicle = z.infer<typeof insertVehicleSchema>;
export type Expense = typeof expenses.$inferSelect;
export type InsertExpense = z.infer<typeof insertExpenseSchema>;
export type Income = typeof incomes.$inferSelect;
export type InsertIncome = z.infer<typeof insertIncomeSchema>;
export type MileageLog = typeof mileageLogs.$inferSelect;
export type InsertMileageLog = z.infer<typeof insertMileageLogSchema>;

export type SubmissionReceipt = typeof submissionReceipts.$inferSelect;
export type OdometerCheckin = typeof odometerCheckins.$inferSelect;
export type InsertOdometerCheckin = z.infer<typeof insertOdometerCheckinSchema>;
export type AuditNotice = typeof auditNotices.$inferSelect;
export type InsertAuditNotice = z.infer<typeof insertAuditNoticeSchema>;

export type CreateExpenseRequest = InsertExpense;
export type CreateIncomeRequest = InsertIncome;
export type UpdateVehicleRequest = Partial<InsertVehicle>;
export type UpdateExpenseRequest = Partial<InsertExpense>;
export type UpdateIncomeRequest = Partial<InsertIncome>;
export type UpdateMileageLogRequest = Partial<InsertMileageLog>;

// Tax Summary Types — mirrors Schedule C logic
export interface TaxSummary {
  grossIncome: number;
  totalPlatformFees: number;
  totalMiles: number;
  mileageDeduction: number;
  totalOtherExpenses: number;
  totalDeductions: number;
  netProfit: number;
  seTaxableBase: number;
  selfEmploymentTax: number;
  seDeduction: number;
  estimatedQuarterlyPayment: number;
  expensesByCategory: Record<string, number>;
  incomeBySource: Record<string, number>;
  quarterlyDeadlines: string[];
  mileageRate: number;
  tipIncome: number;
  tipExemption: number;
  saltDeductionCap: number;
}

export const lifecycleEmails = pgTable("lifecycle_emails", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  emailType: text("email_type").notNull(),
  sentAt: timestamp("sent_at").defaultNow(),
  segment: text("segment"),
  metadata: jsonb("metadata"),
});

export type LifecycleEmail = typeof lifecycleEmails.$inferSelect;
export type InsertLifecycleEmail = typeof lifecycleEmails.$inferInsert;

// Gig Sync Entries - Multi-Gig Bridge merged timeline
export const gigSyncEntries = pgTable("gig_sync_entries", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  platform: text("platform").notNull(),
  date: date("date").notNull(),
  amount: numeric("amount").notNull(),
  description: text("description"),
  tips: numeric("tips").default("0"),
  platformFees: numeric("platform_fees").default("0"),
  miles: numeric("miles").default("0"),
  tripType: text("trip_type"),
  rawCsvRow: jsonb("raw_csv_row"),
  importedToIncome: boolean("imported_to_income").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export type GigSyncEntry = typeof gigSyncEntries.$inferSelect;
export type InsertGigSyncEntry = typeof gigSyncEntries.$inferInsert;

export const insertGigSyncEntrySchema = createInsertSchema(gigSyncEntries).omit({ id: true, createdAt: true });
export type InsertGigSyncEntryRequest = z.infer<typeof insertGigSyncEntrySchema>;

// Regional expense averages for Audit Sentinel risk analysis
export const REGIONAL_EXPENSE_AVERAGES: Record<string, number> = {
  "Car and Truck Expenses": 8500,
  "Commissions and Fees": 3200,
  "Home Office": 1800,
  "Insurance": 2400,
  "Interest": 1200,
  "Legal and Professional Services": 800,
  "Office Expense": 600,
  "Property Tax (SALT)": 3500,
  "Other Expenses": 1500,
};

export type AuditRiskLevel = "low" | "medium" | "high";

export interface AuditRiskResult {
  overallRisk: AuditRiskLevel;
  totalScore: number;
  categoryRisks: Array<{
    category: string;
    userAmount: number;
    regionalAverage: number;
    deviationPct: number;
    risk: AuditRiskLevel;
    flag: string;
  }>;
  recommendations: string[];
}

export const SUPPORTED_CURRENCIES = [
  "USD", "EUR", "GBP", "PKR", "AED", "SAR", "VND", "INR", "BDT", "NGN", "KES",
  "ZAR", "BRL", "MXN", "PHP", "EGP", "TRY", "ARS", "LBP", "VES",
] as const;
export type SupportedCurrency = typeof SUPPORTED_CURRENCIES[number];

export const STABLE_BENCHMARKS = ["USD", "EUR", "GBP", "XAU"] as const;
export type StableBenchmark = typeof STABLE_BENCHMARKS[number];

export const currencyRates = pgTable("currency_rates", {
  id: serial("id").primaryKey(),
  baseCurrency: text("base_currency").notNull(),
  targetCurrency: text("target_currency").notNull(),
  rate: numeric("rate").notNull(),
  previousRate: numeric("previous_rate"),
  volatilityPct: numeric("volatility_pct"),
  provider: text("provider").notNull().default("exchangerate-api"),
  fetchedAt: timestamp("fetched_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
});

export const vaultLocks = pgTable("vault_locks", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id").notNull(),
  originalCurrency: text("original_currency").notNull(),
  originalAmount: numeric("original_amount").notNull(),
  lockedRate: numeric("locked_rate").notNull(),
  usdAmount: numeric("usd_amount").notNull(),
  benchmarkAsset: text("benchmark_asset").default("USD"),
  lockedAt: timestamp("locked_at").notNull().defaultNow(),
});

export const currencyRatesRelations = relations(currencyRates, () => ({}));
export const vaultLocksRelations = relations(vaultLocks, ({ one }) => ({
  user: one(users, {
    fields: [vaultLocks.userId],
    references: [users.id],
  }),
}));

export type CurrencyRate = typeof currencyRates.$inferSelect;
export type InsertCurrencyRate = typeof currencyRates.$inferInsert;
export type VaultLock = typeof vaultLocks.$inferSelect;
export type InsertVaultLock = typeof vaultLocks.$inferInsert;

export interface CurrencyConversion {
  from: string;
  to: string;
  rate: number;
  amount: number;
  converted: number;
  benchmark?: { asset: string; benchmarkRate: number; stabilityIndex: number };
  inflationWarning?: string;
}

export interface DHIPStatus {
  activeCurrency: string;
  baseCurrency: string;
  lastSync: string | null;
  ratesAvailable: number;
  volatileWarnings: string[];
  benchmarkAsset: string;
  lockedTransactions: number;
}

export const quarterlySubmissions = pgTable("quarterly_submissions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  taxYear: integer("tax_year").notNull(),
  quarter: integer("quarter").notNull(),
  jurisdiction: text("jurisdiction").notNull().default("US"),
  status: text("status").notNull().default("pending"),
  totalIncome: numeric("total_income").default("0"),
  totalExpenses: numeric("total_expenses").default("0"),
  netProfit: numeric("net_profit").default("0"),
  submittedAt: timestamp("submitted_at"),
  confirmedAt: timestamp("confirmed_at"),
  referenceId: text("reference_id"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertQuarterlySubmissionSchema = createInsertSchema(quarterlySubmissions).omit({ id: true, createdAt: true });
export type InsertQuarterlySubmission = z.infer<typeof insertQuarterlySubmissionSchema>;
export type QuarterlySubmission = typeof quarterlySubmissions.$inferSelect;

export const eInvoices = pgTable("e_invoices", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  vaultEmail: text("vault_email").notNull(),
  senderEmail: text("sender_email"),
  senderName: text("sender_name"),
  invoiceNumber: text("invoice_number"),
  amount: numeric("amount"),
  currency: text("currency").default("USD"),
  description: text("description"),
  category: text("category"),
  invoiceDate: text("invoice_date"),
  rawPayload: jsonb("raw_payload"),
  status: text("status").notNull().default("pending"),
  linkedExpenseId: integer("linked_expense_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertEInvoiceSchema = createInsertSchema(eInvoices).omit({ id: true, createdAt: true });
export type InsertEInvoice = z.infer<typeof insertEInvoiceSchema>;
export type EInvoice = typeof eInvoices.$inferSelect;

export const QUARTERLY_PERIODS: Record<string, { start: string; end: string; deadline: string }> = {
  "2025-Q1": { start: "2025-01-01", end: "2025-03-31", deadline: "2025-04-15" },
  "2025-Q2": { start: "2025-04-01", end: "2025-06-30", deadline: "2025-06-15" },
  "2025-Q3": { start: "2025-07-01", end: "2025-09-30", deadline: "2025-09-15" },
  "2025-Q4": { start: "2025-10-01", end: "2025-12-31", deadline: "2026-01-15" },
  "2026-Q1": { start: "2026-01-01", end: "2026-03-31", deadline: "2026-04-15" },
  "2026-Q2": { start: "2026-04-01", end: "2026-06-30", deadline: "2026-06-15" },
  "2026-Q3": { start: "2026-07-01", end: "2026-09-30", deadline: "2026-09-15" },
  "2026-Q4": { start: "2026-10-01", end: "2026-12-31", deadline: "2027-01-15" },
};

export const referrals = pgTable("referrals", {
  id: serial("id").primaryKey(),
  referrerId: text("referrer_id").notNull().references(() => users.id),
  referredEmail: text("referred_email").notNull(),
  referredUserId: text("referred_user_id"),
  referralCode: text("referral_code").notNull(),
  status: text("status").notNull().default("pending"),
  creditAwarded: integer("credit_awarded").default(0),
  season: text("season").notNull(),
  convertedAt: timestamp("converted_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertReferralSchema = createInsertSchema(referrals).omit({ id: true, createdAt: true });
export type InsertReferral = z.infer<typeof insertReferralSchema>;
export type Referral = typeof referrals.$inferSelect;

export const referralSeasons = pgTable("referral_seasons", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  jurisdiction: text("jurisdiction").notNull().default("US"),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  archivedAt: timestamp("archived_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type ReferralSeason = typeof referralSeasons.$inferSelect;

export const adminSettings = pgTable("admin_settings", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type AdminSetting = typeof adminSettings.$inferSelect;

export const REFERRAL_TIERS = [
  { minReferrals: 5, discount: 10, label: "Bronze" },
  { minReferrals: 10, discount: 15, label: "Silver" },
  { minReferrals: 20, discount: 20, label: "Gold" },
] as const;

export const finalDeclarations = pgTable("final_declarations", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  taxYear: text("tax_year").notNull(),
  status: text("status").notNull().default("unpaid"),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  stripeSessionId: text("stripe_session_id"),
  paidAt: timestamp("paid_at"),
  submittedAt: timestamp("submitted_at"),
  hmrcSubmissionId: text("hmrc_submission_id"),
  totalGrossIncome: numeric("total_gross_income").default("0"),
  personalAllowance: numeric("personal_allowance").default("12570"),
  taxableIncome: numeric("taxable_income").default("0"),
  estimatedTax: numeric("estimated_tax").default("0"),
  taxAlreadyPaid: numeric("tax_already_paid").default("0"),
  balanceDue: numeric("balance_due").default("0"),
  otherIncomePaye: numeric("other_income_paye").default("0"),
  otherIncomeDividends: numeric("other_income_dividends").default("0"),
  certificateUrl: text("certificate_url"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertFinalDeclarationSchema = createInsertSchema(finalDeclarations).omit({ id: true, createdAt: true });
export type InsertFinalDeclaration = z.infer<typeof insertFinalDeclarationSchema>;
export type FinalDeclaration = typeof finalDeclarations.$inferSelect;

export const waitlistSignups = pgTable("waitlist_signups", {
  id: serial("id").primaryKey(),
  email: text("email").notNull(),
  countryCode: text("country_code").notNull(),
  countryName: text("country_name").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  source: text("source").default("global_tax_page"),
});

export const insertWaitlistSignupSchema = createInsertSchema(waitlistSignups).omit({ id: true, createdAt: true }).extend({
  email: z.string().email("Please enter a valid email address"),
  countryCode: z.string().min(2).max(6),
  countryName: z.string().min(1),
});
export type InsertWaitlistSignup = z.infer<typeof insertWaitlistSignupSchema>;
export type WaitlistSignup = typeof waitlistSignups.$inferSelect;

export const UK_TAX_BANDS_2026_27 = [
  { min: 0, max: 12570, rate: 0, label: "Personal Allowance" },
  { min: 12571, max: 50270, rate: 0.20, label: "Basic Rate (20%)" },
  { min: 50271, max: 125140, rate: 0.40, label: "Higher Rate (40%)" },
  { min: 125141, max: Infinity, rate: 0.45, label: "Additional Rate (45%)" },
] as const;

export const UK_MTD_QUARTERLY_PERIODS: Record<string, { start: string; end: string; deadline: string }> = {
  "2026-Q1": { start: "2026-04-06", end: "2026-07-05", deadline: "2026-08-05" },
  "2026-Q2": { start: "2026-07-06", end: "2026-10-05", deadline: "2026-11-05" },
  "2026-Q3": { start: "2026-10-06", end: "2027-01-05", deadline: "2027-02-05" },
  "2026-Q4": { start: "2027-01-06", end: "2027-04-05", deadline: "2027-05-05" },
};
