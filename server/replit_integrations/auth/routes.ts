import type { Express } from "express";
import { authStorage } from "./storage";
import { isAuthenticated } from "./replitAuth";

export function registerAuthRoutes(app: Express): void {
  app.get("/api/auth/user", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await authStorage.getUser(userId);

      if (user?.isDeactivated) {
        req.logout(() => {
          res.status(403).json({
            message: "Account deactivated",
            deactivated: true,
            accountDeletedAt: user.accountDeletedAt,
            scheduledPurgeAt: user.scheduledPurgeAt,
          });
        });
        return;
      }

      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });
}
