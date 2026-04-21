import { sql } from "drizzle-orm";
import { boolean, index, jsonb, numeric, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";

// Session storage table.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)]
);

// User storage table.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  termsAcceptedAt: timestamp("terms_accepted_at"),
  termsVersion: varchar("terms_version"),
  dataDeletionRequestedAt: timestamp("data_deletion_requested_at"),
  accountDeletedAt: timestamp("account_deleted_at"),
  accountDeleteConfirmation: varchar("account_delete_confirmation"),
  scheduledPurgeAt: timestamp("scheduled_purge_at"),
  isDeactivated: boolean("is_deactivated").default(false),
  isVerified: boolean("is_verified").default(false),
  verificationStatus: varchar("verification_status").default("pending"),
  subscriptionStatus: varchar("subscription_status").default("basic"),
  stripeCustomerId: varchar("stripe_customer_id"),
  stripeSubscriptionId: varchar("stripe_subscription_id"),
  dataRetentionUntil: timestamp("data_retention_until"),
  vaultEnabled: boolean("vault_enabled").default(false),
  lockedTaxYears: jsonb("locked_tax_years").default([]),
  stateCode: varchar("state_code"),
  localTaxEnabled: boolean("local_tax_enabled").default(false),
  localTaxJurisdiction: varchar("local_tax_jurisdiction"),
  partialYearResident: boolean("partial_year_resident").default(false),
  partialYearStates: jsonb("partial_year_states").default([]),
  tipIncomeAmount: varchar("tip_income_amount"),
  dlImageUrl: varchar("dl_image_url"),
  dlStateOcr: varchar("dl_state_ocr"),
  residencyStatus: varchar("residency_status"),
  movedDuringYear: boolean("moved_during_year").default(false),
  movedFromState: varchar("moved_from_state"),
  movedToState: varchar("moved_to_state"),
  movedDate: varchar("moved_date"),
  userSegment: varchar("user_segment"),
  utilityBillUrl: varchar("utility_bill_url"),
  lastLoginAt: timestamp("last_login_at"),
  inactivityEmailSent: varchar("inactivity_email_sent"),
  hasExported2026: boolean("has_exported_2026").default(false),
  simplifiedView: boolean("simplified_view").default(false),
  detectedCountry: varchar("detected_country"),
  earningsGoal: numeric("earnings_goal"),
  isVip: boolean("is_vip").default(false),
  vipLabel: varchar("vip_label").default("MCTUSA Founder's Circle"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
