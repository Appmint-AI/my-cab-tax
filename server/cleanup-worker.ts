import { db } from "./db";
import { users } from "@shared/models/auth";
import { expenses, incomes, receipts, mileageLogs, vehicles } from "@shared/schema";
import { eq, and, lt, lte, isNull, isNotNull, or, ne } from "drizzle-orm";
import { getResendClient } from "./resend";
import { log } from "./index";

const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * DAY_MS);
}

async function sendInactivityEmail(
  email: string,
  firstName: string | null,
  type: "reminder" | "urgent" | "purged"
) {
  try {
    const { client, fromEmail } = await getResendClient();
    const name = firstName || "Driver";

    const usaFooter = `
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0 12px;" />
      <p style="color:#999;font-size:11px;line-height:1.4;">
        This communication pertains strictly to My Cab Tax USA services and data. For UK-related inquiries, please contact the UK support branch.<br/>
        My Cab Tax USA &bull; Legal Notices: legal@mycabtax.com &bull; Jurisdiction: State of Delaware, USA
      </p>
    `;

    const subjects: Record<string, string> = {
      reminder: "We miss you! Your tax data will be deleted soon",
      urgent: "URGENT: Your tax records are scheduled for deletion in 10 days",
      purged: "Your tax data has been removed",
    };

    const bodies: Record<string, string> = {
      reminder: `
        <h2>Hi ${name},</h2>
        <p>We haven't seen you in a while! Just a reminder that <strong>Free accounts have their tax data purged after 90 days of inactivity</strong>.</p>
        <p>Log in now to keep your data safe, or upgrade to Pro for 7-year IRS-compliant storage.</p>
        <p><a href="https://mycabtaxusa.com">Log In Now</a></p>
        <p style="color: #666; font-size: 12px;">My Cab Tax USA - This is an automated reminder. You are receiving this because you have a free account with us.</p>
        ${usaFooter}
      `,
      urgent: `
        <h2>Hi ${name},</h2>
        <p><strong style="color: #dc2626;">Your tax records are scheduled for deletion in 10 days.</strong></p>
        <p>Because your Free account has been inactive for 80 days, your mileage logs, expense records, income data, and tax calculations will be permanently deleted in 10 days.</p>
        <p><strong>The IRS requires you to keep tax records for at least 3 years.</strong> Make sure you export your data before it's gone.</p>
        <p><a href="https://mycabtaxusa.com">Log In & Save Your Data</a></p>
        <p>Want to never worry about this again? <strong>Upgrade to Pro</strong> for guaranteed 7-year storage in our Tax Vault with unlimited receipt photos and certified PDF Audit Packs.</p>
        <p><a href="https://mycabtaxusa.com/upgrade">Upgrade to Pro</a></p>
        <p style="color: #666; font-size: 12px;">My Cab Tax USA - This is an automated reminder. You are receiving this because you have a free account with us.</p>
        ${usaFooter}
      `,
      purged: `
        <h2>Hi ${name},</h2>
        <p>Your tax data has been removed from My Cab Tax USA due to 90 days of inactivity on your Free account.</p>
        <p>Your account profile is still active &mdash; you can log back in and start fresh at any time.</p>
        <p>Next time, consider upgrading to <strong>Pro</strong> for 7-year guaranteed storage so you never lose your records again.</p>
        <p><a href="https://mycabtaxusa.com">Start Fresh</a> | <a href="https://mycabtaxusa.com/upgrade">Upgrade to Pro</a></p>
        <p style="color: #666; font-size: 12px;">My Cab Tax USA - This is an automated notification. You are receiving this because you have a free account with us.</p>
        ${usaFooter}
      `,
    };

    await client.emails.send({
      from: fromEmail,
      to: email,
      subject: subjects[type],
      html: bodies[type],
    });

    log(`Inactivity email (${type}) sent to ${email}`, "cleanup");
  } catch (error) {
    log(`Failed to send inactivity email (${type}) to ${email}: ${error}`, "cleanup");
  }
}

export async function runCleanupCycle() {
  log("Starting inactivity cleanup cycle...", "cleanup");

  try {
    const allFreeUsers = await db
      .select()
      .from(users)
      .where(
        and(
          or(eq(users.subscriptionStatus, "free"), eq(users.subscriptionStatus, "basic"), isNull(users.subscriptionStatus)),
          eq(users.isDeactivated, false),
          isNotNull(users.lastLoginAt),
          isNotNull(users.email)
        )
      );

    const now = Date.now();
    let reminderCount = 0;
    let urgentCount = 0;
    let purgedCount = 0;

    for (const user of allFreeUsers) {
      if (!user.lastLoginAt || !user.email) continue;

      const daysSinceLogin = Math.floor((now - user.lastLoginAt.getTime()) / DAY_MS);
      const emailSent = user.inactivityEmailSent;

      if (daysSinceLogin >= 90 && emailSent !== "purged") {
        await db.delete(expenses).where(eq(expenses.userId, user.id));
        await db.delete(incomes).where(eq(incomes.userId, user.id));

        await sendInactivityEmail(user.email, user.firstName, "purged");

        await db
          .update(users)
          .set({
            inactivityEmailSent: "purged",
            dataDeletionRequestedAt: new Date(),
            termsAcceptedAt: null,
            termsVersion: null,
            updatedAt: new Date(),
          })
          .where(eq(users.id, user.id));
        purgedCount++;
      } else if (daysSinceLogin >= 80 && daysSinceLogin < 90 && emailSent !== "urgent" && emailSent !== "purged") {
        await sendInactivityEmail(user.email, user.firstName, "urgent");

        await db
          .update(users)
          .set({ inactivityEmailSent: "urgent", updatedAt: new Date() })
          .where(eq(users.id, user.id));
        urgentCount++;
      } else if (daysSinceLogin >= 60 && daysSinceLogin < 80 && emailSent !== "reminder" && emailSent !== "urgent" && emailSent !== "purged") {
        await sendInactivityEmail(user.email, user.firstName, "reminder");

        await db
          .update(users)
          .set({ inactivityEmailSent: "reminder", updatedAt: new Date() })
          .where(eq(users.id, user.id));
        reminderCount++;
      }
    }

    log(
      `Cleanup cycle complete: ${reminderCount} reminders, ${urgentCount} urgent warnings, ${purgedCount} accounts purged`,
      "cleanup"
    );

    // Hard-purge soft-deleted accounts older than 30 days
    const purgeThreshold = daysAgo(30);
    const softDeletedUsers = await db
      .select()
      .from(users)
      .where(
        and(
          eq(users.isDeactivated, true),
          isNotNull(users.accountDeletedAt),
          lte(users.accountDeletedAt, purgeThreshold)
        )
      );

    let hardPurgedCount = 0;
    for (const user of softDeletedUsers) {
      await db.delete(receipts).where(eq(receipts.userId, user.id));
      await db.delete(mileageLogs).where(eq(mileageLogs.userId, user.id));
      await db.delete(expenses).where(eq(expenses.userId, user.id));
      await db.delete(incomes).where(eq(incomes.userId, user.id));
      await db.delete(vehicles).where(eq(vehicles.userId, user.id));
      await db.delete(users).where(eq(users.id, user.id));
      hardPurgedCount++;
      log(`Hard-purged soft-deleted account: ${user.id} (deleted at ${user.accountDeletedAt?.toISOString()})`, "cleanup");
    }

    if (hardPurgedCount > 0) {
      log(`Hard-purge complete: ${hardPurgedCount} accounts permanently removed`, "cleanup");
    }

    const currentTime = new Date();
    const expiredReceipts = await db.delete(receipts).where(lt(receipts.expiresAt, currentTime)).returning();
    if (expiredReceipts.length > 0) {
      log(`Expired receipt cleanup: ${expiredReceipts.length} receipts removed`, "cleanup");
    }
  } catch (error) {
    log(`Cleanup cycle error: ${error}`, "cleanup");
  }
}

export function startCleanupWorker() {
  const INTERVAL_MS = 6 * 60 * 60 * 1000;

  log("Cleanup worker started. Will run every 6 hours.", "cleanup");

  setTimeout(() => {
    runCleanupCycle();
  }, 10000);

  setInterval(() => {
    runCleanupCycle();
  }, INTERVAL_MS);
}
