import { users, type User, type UpsertUser } from "@shared/models/auth";
import { db } from "../../db";
import { eq } from "drizzle-orm";

// Interface for auth storage operations
// (IMPORTANT) These user operations are mandatory for Replit Auth.
export interface IAuthStorage {
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  touchLastLogin(id: string): Promise<void>;
  updateDetectedCountry(id: string, countryCode: string): Promise<void>;
}

class AuthStorage implements IAuthStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  async touchLastLogin(id: string): Promise<void> {
    await db
      .update(users)
      .set({ lastLoginAt: new Date(), inactivityEmailSent: null, updatedAt: new Date() })
      .where(eq(users.id, id));
  }

  async updateDetectedCountry(id: string, countryCode: string): Promise<void> {
    await db
      .update(users)
      .set({ detectedCountry: countryCode, updatedAt: new Date() })
      .where(eq(users.id, id));
  }
}

export const authStorage = new AuthStorage();
