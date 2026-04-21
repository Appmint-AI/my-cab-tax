import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "openid-client/passport";

import passport from "passport";
import session from "express-session";
import type { Express, Request, RequestHandler } from "express";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
import { authStorage } from "./storage";
import { detectCountryFromIP } from "../../geo-detect";

function getAuth0Domain(): string {
  const domain = process.env.AUTH0_DOMAIN;
  if (!domain) throw new Error("AUTH0_DOMAIN environment variable is required. Please set it in your Secrets.");
  return domain;
}

function getAuth0ClientId(): string {
  const id = process.env.AUTH0_CLIENT_ID;
  if (!id) throw new Error("AUTH0_CLIENT_ID environment variable is required. Please set it in your Secrets.");
  return id;
}

function getAuth0ClientSecret(): string {
  const secret = process.env.AUTH0_CLIENT_SECRET;
  if (!secret) throw new Error("AUTH0_CLIENT_SECRET environment variable is required. Please set it in your Secrets.");
  return secret;
}

function isAuth0Configured(): boolean {
  return !!(process.env.AUTH0_DOMAIN && process.env.AUTH0_CLIENT_ID && process.env.AUTH0_CLIENT_SECRET);
}

const getOidcConfig = memoize(
  async () => {
    const issuerUrl = `https://${getAuth0Domain()}`;
    return await client.discovery(
      new URL(issuerUrl),
      getAuth0ClientId(),
      getAuth0ClientSecret(),
    );
  },
  { maxAge: 3600 * 1000 }
);

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: true,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: true,
      maxAge: sessionTtl,
    },
  });
}

function updateUserSession(
  user: any,
  tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers
) {
  user.claims = tokens.claims();
  user.access_token = tokens.access_token;
  user.refresh_token = tokens.refresh_token;
  user.expires_at = user.claims?.exp;
}

function sanitizeEmail(raw: any): string | null {
  const email = String(raw || "").trim().toLowerCase();
  return email && email.includes("@") ? email : null;
}

async function upsertUser(claims: any, detectedCountry?: string | null) {
  const userData: any = {
    id: claims["sub"],
    email: sanitizeEmail(claims["email"]),
    firstName: claims["given_name"] || claims["first_name"] || claims["nickname"] || null,
    lastName: claims["family_name"] || claims["last_name"] || null,
    profileImageUrl: claims["picture"] || claims["profile_image_url"] || null,
    lastLoginAt: new Date(),
    inactivityEmailSent: null,
  };
  if (detectedCountry) {
    userData.detectedCountry = detectedCountry;
  }
  await authStorage.upsertUser(userData);
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  if (!isAuth0Configured()) {
    console.warn("Auth0 is not configured. Set AUTH0_DOMAIN, AUTH0_CLIENT_ID, and AUTH0_CLIENT_SECRET in your Secrets to enable authentication.");

    app.get("/api/login", (_req, res) => {
      res.status(503).json({ message: "Auth0 is not configured. Please set AUTH0_DOMAIN, AUTH0_CLIENT_ID, and AUTH0_CLIENT_SECRET." });
    });
    app.get("/api/callback", (_req, res) => {
      res.status(503).json({ message: "Auth0 is not configured." });
    });
    app.get("/api/logout", (_req, res) => {
      res.redirect("/");
    });
    return;
  }

  const config = await getOidcConfig();

  const verify: VerifyFunction = async (
    tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers,
    verified: passport.AuthenticateCallback
  ) => {
    const user = {};
    updateUserSession(user, tokens);
    await upsertUser(tokens.claims());
    verified(null, user);
  };

  const registeredStrategies = new Set<string>();

  const ensureStrategy = (domain: string) => {
    const strategyName = `auth0:${domain}`;
    if (!registeredStrategies.has(strategyName)) {
      const strategy = new Strategy(
        {
          name: strategyName,
          config,
          scope: "openid email profile offline_access",
          callbackURL: `https://${domain}/api/callback`,
        },
        verify
      );
      passport.use(strategy);
      registeredStrategies.add(strategyName);
    }
  };

  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));

  app.get("/api/login", (req, res, next) => {
    ensureStrategy(req.hostname);
    const uiLocales = (req.query.lang as string) || req.acceptsLanguages("en", "ur", "ar", "vi") || "en";
    passport.authenticate(`auth0:${req.hostname}`, {
      prompt: "login",
      scope: ["openid", "email", "profile", "offline_access"],
      ui_locales: uiLocales,
    })(req, res, next);
  });

  app.get("/api/callback", (req, res, next) => {
    ensureStrategy(req.hostname);
    passport.authenticate(`auth0:${req.hostname}`, async (err: any, user: any, info: any) => {
      if (err) return next(err);
      if (!user) return res.redirect("/api/login");

      req.logIn(user, async (loginErr) => {
        if (loginErr) return next(loginErr);

        const userId = user.claims?.sub;
        if (userId) {
          const clientIp = req.ip || req.socket.remoteAddress || "";
          try {
            let existingUser = await authStorage.getUser(userId);
            if (!existingUser) {
              existingUser = await authStorage.upsertUser({
                id: userId,
                email: sanitizeEmail(user.claims?.email),
                firstName: user.claims?.given_name || user.claims?.nickname || null,
                lastName: user.claims?.family_name || null,
                profileImageUrl: user.claims?.picture || null,
                lastLoginAt: new Date(),
                inactivityEmailSent: null,
              });
            }
            if (!existingUser?.detectedCountry) {
              const geo = await detectCountryFromIP(clientIp);
              if (geo) {
                await authStorage.updateDetectedCountry(userId, geo.countryCode);
              }
            }
          } catch {}
        }
        res.redirect("/");
      });
    })(req, res, next);
  });

  app.get("/api/logout", (req, res) => {
    req.logout(() => {
      const auth0Domain = getAuth0Domain();
      const clientId = getAuth0ClientId();
      const returnTo = `${req.protocol}://${req.hostname}`;
      const logoutUrl = `https://${auth0Domain}/v2/logout?client_id=${encodeURIComponent(clientId)}&returnTo=${encodeURIComponent(returnTo)}`;
      res.redirect(logoutUrl);
    });
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const user = req.user as any;

  if (!req.isAuthenticated() || !user.expires_at) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const userId = user.claims?.sub;
  if (userId) {
    const dbUser = await authStorage.getUser(userId);
    if (dbUser?.isDeactivated) {
      req.logout(() => {
        res.status(403).json({
          message: "Account deactivated",
          deactivated: true,
        });
      });
      return;
    }

    const lastTouch = dbUser?.lastLoginAt ? dbUser.lastLoginAt.getTime() : 0;
    const hoursSinceTouch = (Date.now() - lastTouch) / (1000 * 60 * 60);
    if (hoursSinceTouch >= 1) {
      authStorage.touchLastLogin(userId).catch(() => {});
    }
  }

  const now = Math.floor(Date.now() / 1000);
  if (now <= user.expires_at) {
    return next();
  }

  const refreshToken = user.refresh_token;
  if (!refreshToken) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  try {
    const config = await getOidcConfig();
    const tokenResponse = await client.refreshTokenGrant(config, refreshToken);
    updateUserSession(user, tokenResponse);
    return next();
  } catch (error) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
};
