import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { startCleanupWorker } from "./cleanup-worker";
import { startSentinel } from "./submission/compliance-sentinel";
import { startLifecycleWorker } from "./lifecycle-manager";
import { startForexSyncWorker } from "./currency-engine";
import { startReferralWorker } from "./referral-worker";

const app = express();
// Cloud Run / load balancers: trust X-Forwarded-* so req.protocol, req.hostname, and OAuth URLs match the public HTTPS URL.
// Optional TRUST_PROXY_HOPS (e.g. "1") when only one hop must be trusted.
const trustProxyEnv = process.env.TRUST_PROXY_HOPS;
app.set(
  "trust proxy",
  trustProxyEnv !== undefined && trustProxyEnv !== ""
    ? Number(trustProxyEnv)
    : true,
);
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  if (process.env.NODE_ENV === "production") {
    const entry = {
      severity: "INFO",
      message,
      source,
      timestamp: new Date().toISOString(),
      serviceContext: { service: "mycabtax-usa", version: "1.0.0" },
    };
    console.log(JSON.stringify(entry));
  } else {
    const formattedTime = new Date().toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
    console.log(`${formattedTime} [${source}] ${message}`);
  }
}

export function logError(message: string, error?: any, source = "express") {
  if (process.env.NODE_ENV === "production") {
    const entry = {
      severity: "ERROR",
      message,
      source,
      timestamp: new Date().toISOString(),
      serviceContext: { service: "mycabtax-usa", version: "1.0.0" },
      error: error ? { message: error.message, stack: error.stack } : undefined,
    };
    console.error(JSON.stringify(entry));
  } else {
    const formattedTime = new Date().toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
    console.error(`${formattedTime} [${source}] ERROR: ${message}`, error || "");
  }
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "healthy",
    service: "mycabtax-usa",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || "development",
  });
});

/** QuickBooks / Intuit Developer Portal URL placeholders (OAuth wiring can be completed later). */
function publicAppUrl(): string {
  const raw =
    process.env.APP_URL ||
    process.env.AUTH0_BASE_URL ||
    "";
  return raw.replace(/\/$/, "");
}

/** OAuth redirect / launch landing — register this as Redirect URI in Intuit. */
app.get("/oauth/intuit/callback", (req, res) => {
  const base = publicAppUrl();
  if (!base) {
    return res
      .status(503)
      .send("Configure APP_URL for OAuth redirect targets.");
  }
  const forward = new URLSearchParams(req.query as Record<string, string>).toString();
  res.redirect(
    `${base}/settings?intuit_oauth=callback${forward ? `&${forward}` : ""}`,
  );
});

/** Entry URL documented as “Connect / Reconnect” — lands in SPA Settings integrations. */
app.get("/oauth/intuit/start", (_req, res) => {
  const base = publicAppUrl();
  if (!base) {
    return res.status(503).send("Configure APP_URL for OAuth entry URL.");
  }
  res.redirect(`${base}/settings?intuit_oauth=start`);
});

/** Disconnect webhook target Intuit may POST to when a firm disconnects the app. */
app.post("/api/webhooks/intuit/disconnect", (_req, res) => {
  res.status(200).json({ ok: true });
});

(async () => {
  try {
    await registerRoutes(httpServer, app);

    app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";

      console.error("Internal Server Error:", err);

      if (res.headersSent) {
        return next(err);
      }

      return res.status(status).json({ message });
    });

    // importantly only setup vite in development and after
    // setting up all the other routes so the catch-all route
    // doesn't interfere with the other routes
    if (process.env.NODE_ENV === "production") {
      serveStatic(app);
    } else {
      const { setupVite } = await import("./vite");
      await setupVite(httpServer, app);
    }

    // ALWAYS serve the app on the port specified in the environment variable PORT
    // Other ports are firewalled. Default to 5000 if not specified.
    // this serves both the API and the client.
    // It is the only port that is not firewalled.
    const port = parseInt(process.env.PORT || "5000", 10);
    // Cloud Run sets K_SERVICE; SO_REUSEPORT can prevent bind in some container setups
    const isCloudRun = !!process.env.K_SERVICE;
    const listenOpts: Parameters<typeof httpServer.listen>[0] = {
      port,
      host: process.platform === "win32" ? "127.0.0.1" : "0.0.0.0",
      ...(process.platform !== "win32" && !isCloudRun && { reusePort: true }),
    } as Parameters<typeof httpServer.listen>[0];

    httpServer.listen(listenOpts, () => {
      log(`serving on port ${port}`);
      startCleanupWorker();
      startSentinel(6);
      startLifecycleWorker();
      startForexSyncWorker();
      startReferralWorker();
    });
  } catch (startupErr) {
    logError("Server startup failed", startupErr);
    process.exit(1);
  }
})();
