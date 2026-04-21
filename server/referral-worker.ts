import { db } from "./db";
import { eq, and, count, sql } from "drizzle-orm";
import { referrals, referralSeasons, adminSettings, users, REFERRAL_TIERS } from "@shared/schema";

function getCurrentSeason(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = now.getDate();

  if (month >= 4 && day >= 6 || month > 4) {
    return `UK-${year}-${year + 1}`;
  }
  return `US-${year}`;
}

function getUserTier(activeCount: number) {
  let tier = null;
  for (const t of REFERRAL_TIERS) {
    if (activeCount >= t.minReferrals) {
      tier = t;
    }
  }
  return tier;
}

function getNextTierDown(activeCount: number) {
  const sorted = [...REFERRAL_TIERS].sort((a, b) => b.minReferrals - a.minReferrals);
  for (const t of sorted) {
    if (activeCount >= t.minReferrals) {
      return t;
    }
  }
  return null;
}

export async function checkSafetyNet() {
  console.log("[referral] Running safety net check...");
  try {
    const season = getCurrentSeason();

    const referrerCounts = await db
      .select({
        referrerId: referrals.referrerId,
        activeCount: count(referrals.id),
      })
      .from(referrals)
      .where(and(
        eq(referrals.status, "converted"),
        eq(referrals.season, season),
      ))
      .groupBy(referrals.referrerId);

    let alertsSent = 0;
    for (const { referrerId, activeCount } of referrerCounts) {
      const numCount = Number(activeCount);
      const currentTier = getUserTier(numCount);
      if (!currentTier) continue;

      const threshold = currentTier.minReferrals;
      const margin = numCount - threshold;

      if (margin <= 3 && margin >= 0) {
        console.log(`[referral] Safety net alert: user ${referrerId.slice(0, 8)}... has ${numCount} referrals, only ${margin} above ${currentTier.label} tier (${currentTier.discount}% discount)`);
        alertsSent++;
      }
    }

    console.log(`[referral] Safety net check complete: ${referrerCounts.length} users checked, ${alertsSent} alerts`);
  } catch (error: any) {
    console.error("[referral] Safety net error:", error.message);
  }
}

export async function checkAnnualReset() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const day = now.getDate();

  const isUSReset = month === 1 && day === 1;
  const isUKReset = month === 4 && day === 6;

  if (!isUSReset && !isUKReset) return;

  const jurisdiction = isUSReset ? "US" : "UK";
  const year = now.getFullYear();
  const seasonName = isUSReset ? `US-${year - 1}` : `UK-${year - 1}-${year}`;
  const newSeasonName = isUSReset ? `US-${year}` : `UK-${year}-${year + 1}`;

  console.log(`[referral] Annual reset triggered for ${jurisdiction}: archiving ${seasonName}, starting ${newSeasonName}`);

  try {
    await db.update(referralSeasons)
      .set({ isActive: false, archivedAt: new Date() })
      .where(and(
        eq(referralSeasons.name, seasonName),
        eq(referralSeasons.jurisdiction, jurisdiction),
      ));

    const [existing] = await db.select().from(referralSeasons)
      .where(eq(referralSeasons.name, newSeasonName));

    if (!existing) {
      const startDate = isUSReset ? `${year}-01-01` : `${year}-04-06`;
      const endDate = isUSReset ? `${year}-12-31` : `${year + 1}-04-05`;

      await db.insert(referralSeasons).values({
        name: newSeasonName,
        jurisdiction,
        startDate,
        endDate,
        isActive: true,
      });
    }

    console.log(`[referral] Season ${newSeasonName} activated for ${jurisdiction}`);
  } catch (error: any) {
    console.error("[referral] Annual reset error:", error.message);
  }
}

export async function getAdminSetting(key: string): Promise<string | null> {
  try {
    const [setting] = await db.select().from(adminSettings).where(eq(adminSettings.key, key));
    return setting?.value || null;
  } catch {
    return null;
  }
}

export async function setAdminSetting(key: string, value: string) {
  const [existing] = await db.select().from(adminSettings).where(eq(adminSettings.key, key));
  if (existing) {
    await db.update(adminSettings).set({ value, updatedAt: new Date() }).where(eq(adminSettings.key, key));
  } else {
    await db.insert(adminSettings).values({ key, value });
  }
}

export function startReferralWorker() {
  console.log("[referral] Referral worker started. Safety net checks every 24h.");

  checkAnnualReset();
  checkSafetyNet();

  setInterval(() => {
    checkAnnualReset();
    checkSafetyNet();
  }, 24 * 60 * 60 * 1000);
}
