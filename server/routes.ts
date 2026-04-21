import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { db } from "./db";
import { eq, and } from "drizzle-orm";
import { users } from "@shared/models/auth";
import { api } from "@shared/routes";
import { z } from "zod";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
import Stripe from "stripe";
import multer from "multer";
import path from "path";
import fs from "fs";
import { uploadToVault, getReceiptSignedUrl, deleteFromVault, getReceiptBuffer } from "./receipt-vault";
import { scanReceiptWithAI } from "./receipt-ocr";

const UPLOADS_DIR = path.join(process.cwd(), "uploads", "receipts");

const receiptUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/heic"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only JPEG, PNG, WebP, and HEIC images are allowed"));
    }
  },
});

function getTaxYearFromDate(dateStr: string): number {
  const d = new Date(dateStr);
  return d.getFullYear();
}

async function checkYearLock(userId: string, dateStr: string | undefined): Promise<string | null> {
  if (!dateStr) return null;
  const taxYear = getTaxYearFromDate(dateStr);
  const locked = await storage.isTaxYearLocked(userId, taxYear);
  if (locked) {
    return `Tax year ${taxYear} is finalized and locked. Records for this year cannot be created, edited, or deleted.`;
  }
  return null;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Setup Auth first
  await setupAuth(app);
  registerAuthRoutes(app);

  // Protected Routes Middleware - apply to all /api routes except auth
  // Note: auth routes are already registered above
  
  // Vehicles Routes
  app.get(api.vehicles.list.path, isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const vehicleList = await storage.getVehicles(userId);
    res.json(vehicleList);
  });

  app.post(api.vehicles.create.path, isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const input = api.vehicles.create.input.parse(req.body);
      const vehicle = await storage.createVehicle({ ...input, userId });
      res.status(201).json(vehicle);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.get(api.vehicles.get.path, isAuthenticated, async (req, res) => {
    const vehicle = await storage.getVehicle(Number(req.params.id));
    if (!vehicle) {
      return res.status(404).json({ message: 'Vehicle not found' });
    }
    const userId = (req.user as any).claims.sub;
    if (vehicle.userId !== userId) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    res.json(vehicle);
  });

  app.put(api.vehicles.update.path, isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const input = api.vehicles.update.input.parse(req.body);
      const updated = await storage.updateVehicle(userId, Number(req.params.id), input);
      if (!updated) {
        return res.status(404).json({ message: 'Vehicle not found' });
      }
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.delete(api.vehicles.delete.path, isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    await storage.deleteVehicle(userId, Number(req.params.id));
    res.sendStatus(204);
  });

  // Expenses Routes
  app.get(api.expenses.list.path, isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const expenses = await storage.getExpenses(userId);
    res.json(expenses);
  });

  app.post(api.expenses.create.path, isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const input = api.expenses.create.input.parse(req.body);
      const lockMsg = await checkYearLock(userId, input.date);
      if (lockMsg) return res.status(403).json({ message: lockMsg, locked: true });
      const expenseData: any = { ...input, userId };
      const reqCurrency = req.body.currency || input.anchorCurrency;
      if (reqCurrency && reqCurrency !== "USD") {
        try {
          const { getRate } = await import("./currency-engine");
          const rate = await getRate(reqCurrency, "USD");
          if (rate) {
            expenseData.anchorCurrency = reqCurrency;
            expenseData.anchoredUsdAmount = String(Number((parseFloat(String(input.amount)) * rate).toFixed(2)));
            expenseData.anchoredAt = new Date();
          }
        } catch {}
      }
      const expense = await storage.createExpense(expenseData);
      res.status(201).json(expense);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.get(api.expenses.get.path, isAuthenticated, async (req, res) => {
    const expense = await storage.getExpense(Number(req.params.id));
    if (!expense) {
      return res.status(404).json({ message: 'Expense not found' });
    }
    // Optional: Check ownership
    const userId = (req.user as any).claims.sub;
    if (expense.userId !== userId) {
        return res.status(403).json({ message: 'Forbidden' });
    }
    res.json(expense);
  });

  app.put(api.expenses.update.path, isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const existing = await storage.getExpense(Number(req.params.id));
      if (existing) {
        const lockMsg = await checkYearLock(userId, existing.date);
        if (lockMsg) return res.status(403).json({ message: lockMsg, locked: true });
      }
      const input = api.expenses.update.input.parse(req.body);
      if (input.date) {
        const lockMsg2 = await checkYearLock(userId, input.date);
        if (lockMsg2) return res.status(403).json({ message: lockMsg2, locked: true });
      }
      const updated = await storage.updateExpense(userId, Number(req.params.id), input);
      if (!updated) {
        return res.status(404).json({ message: 'Expense not found' });
      }
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.delete(api.expenses.delete.path, isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const existing = await storage.getExpense(Number(req.params.id));
    if (existing) {
      const lockMsg = await checkYearLock(userId, existing.date);
      if (lockMsg) return res.status(403).json({ message: lockMsg, locked: true });
    }
    await storage.deleteExpense(userId, Number(req.params.id));
    res.sendStatus(204);
  });

  // Incomes Routes
  app.get(api.incomes.list.path, isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const incomes = await storage.getIncomes(userId);
    res.json(incomes);
  });

  app.post(api.incomes.create.path, isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const input = api.incomes.create.input.parse(req.body);
      const lockMsg = await checkYearLock(userId, input.date);
      if (lockMsg) return res.status(403).json({ message: lockMsg, locked: true });
      const incomeData: any = { ...input, userId };
      const reqCurrency = req.body.currency || input.anchorCurrency;
      if (reqCurrency && reqCurrency !== "USD") {
        try {
          const { getRate } = await import("./currency-engine");
          const rate = await getRate(reqCurrency, "USD");
          if (rate) {
            incomeData.anchorCurrency = reqCurrency;
            incomeData.anchoredUsdAmount = String(Number((parseFloat(String(input.amount)) * rate).toFixed(2)));
            incomeData.anchoredAt = new Date();
          }
        } catch {}
      }
      const income = await storage.createIncome(incomeData);
      res.status(201).json(income);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.get(api.incomes.get.path, isAuthenticated, async (req, res) => {
    const income = await storage.getIncome(Number(req.params.id));
    if (!income) {
      return res.status(404).json({ message: 'Income not found' });
    }
    const userId = (req.user as any).claims.sub;
    if (income.userId !== userId) {
        return res.status(403).json({ message: 'Forbidden' });
    }
    res.json(income);
  });

  app.put(api.incomes.update.path, isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const existing = await storage.getIncome(Number(req.params.id));
      if (existing) {
        const lockMsg = await checkYearLock(userId, existing.date);
        if (lockMsg) return res.status(403).json({ message: lockMsg, locked: true });
      }
      const input = api.incomes.update.input.parse(req.body);
      if (input.date) {
        const lockMsg2 = await checkYearLock(userId, input.date);
        if (lockMsg2) return res.status(403).json({ message: lockMsg2, locked: true });
      }
      const updated = await storage.updateIncome(userId, Number(req.params.id), input);
      if (!updated) {
        return res.status(404).json({ message: 'Income not found' });
      }
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.delete(api.incomes.delete.path, isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const existing = await storage.getIncome(Number(req.params.id));
    if (existing) {
      const lockMsg = await checkYearLock(userId, existing.date);
      if (lockMsg) return res.status(403).json({ message: lockMsg, locked: true });
    }
    await storage.deleteIncome(userId, Number(req.params.id));
    res.sendStatus(204);
  });

  // Mileage Logs Routes
  app.get(api.mileageLogs.list.path, isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const logs = await storage.getMileageLogs(userId);
    res.json(logs);
  });

  app.post(api.mileageLogs.create.path, isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const input = api.mileageLogs.create.input.parse(req.body);
      const lockMsg = await checkYearLock(userId, input.date);
      if (lockMsg) return res.status(403).json({ message: lockMsg, locked: true });
      const log = await storage.createMileageLog({ ...input, userId });
      res.status(201).json(log);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.get(api.mileageLogs.get.path, isAuthenticated, async (req, res) => {
    const log = await storage.getMileageLog(Number(req.params.id));
    if (!log) {
      return res.status(404).json({ message: 'Mileage log not found' });
    }
    const userId = (req.user as any).claims.sub;
    if (log.userId !== userId) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    res.json(log);
  });

  app.put(api.mileageLogs.update.path, isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const existing = await storage.getMileageLog(Number(req.params.id));
      if (existing) {
        const lockMsg = await checkYearLock(userId, existing.date);
        if (lockMsg) return res.status(403).json({ message: lockMsg, locked: true });
      }
      const input = api.mileageLogs.update.input.parse(req.body);
      if (input.date) {
        const lockMsg2 = await checkYearLock(userId, input.date);
        if (lockMsg2) return res.status(403).json({ message: lockMsg2, locked: true });
      }
      const updated = await storage.updateMileageLog(userId, Number(req.params.id), input);
      if (!updated) {
        return res.status(404).json({ message: 'Mileage log not found' });
      }
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.delete(api.mileageLogs.delete.path, isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const existing = await storage.getMileageLog(Number(req.params.id));
    if (existing) {
      const lockMsg = await checkYearLock(userId, existing.date);
      if (lockMsg) return res.status(403).json({ message: lockMsg, locked: true });
    }
    await storage.deleteMileageLog(userId, Number(req.params.id));
    res.sendStatus(204);
  });

  // States endpoint - returns all states with names and tax types
  app.get("/api/states", isAuthenticated, async (_req, res) => {
    try {
      const { getAllStates } = await import("./submission/state-engine");
      const states = getAllStates();
      res.json(states);
    } catch (err: any) {
      console.error("States endpoint error:", err);
      res.status(500).json({ message: "Failed to retrieve states" });
    }
  });

  // State tax estimate endpoint
  app.get("/api/tax/state-estimate", isAuthenticated, async (req, res) => {
    try {
      const stateCode = String(req.query.stateCode || "");
      const netProfit = parseFloat(String(req.query.netProfit || "0"));

      if (!stateCode) {
        return res.status(400).json({ message: "stateCode query parameter is required" });
      }
      if (isNaN(netProfit)) {
        return res.status(400).json({ message: "netProfit must be a valid number" });
      }

      const { calculateStateTax } = await import("./submission/state-engine");
      const result = calculateStateTax(stateCode, netProfit);
      res.json(result);
    } catch (err: any) {
      console.error("State tax estimate error:", err);
      res.status(500).json({ message: "Failed to calculate state tax estimate" });
    }
  });

  // Tax Summary
  app.get(api.tax.summary.path, isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const summary = await storage.getTaxSummary(userId);
    res.json(summary);
  });

  app.get("/uploads/receipts/:filename", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const filename = path.basename(String(req.params.filename));
    const imageUrl = `/uploads/receipts/${filename}`;

    const receipt = await storage.getReceiptByImageUrl(userId, imageUrl);
    if (!receipt) {
      return res.status(404).json({ message: "File not found" });
    }

    const filePath = path.join(UPLOADS_DIR, filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: "File not found" });
    }
    res.sendFile(filePath);
  });

  app.get("/api/receipts/signed-url/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const receipt = await storage.getReceipt(Number(req.params.id));
      if (!receipt) {
        return res.status(404).json({ message: "Receipt not found" });
      }
      if (receipt.userId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
      }

      if (receipt.imageUrl.startsWith("/objects/")) {
        const signedUrl = await getReceiptSignedUrl(receipt.imageUrl);
        return res.json({ url: signedUrl });
      }

      return res.json({ url: receipt.imageUrl });
    } catch (err: any) {
      console.error("Signed URL error:", err);
      res.status(500).json({ message: "Failed to get image URL" });
    }
  });

  // Receipt Routes
  app.get("/api/receipts", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const receiptList = await storage.getReceipts(userId);

    const receiptsWithUrls = await Promise.all(
      receiptList.map(async (r) => {
        if (r.imageUrl.startsWith("/objects/")) {
          try {
            const signedUrl = await getReceiptSignedUrl(r.imageUrl);
            return { ...r, signedImageUrl: signedUrl };
          } catch {
            return { ...r, signedImageUrl: null };
          }
        }
        return { ...r, signedImageUrl: r.imageUrl };
      })
    );

    res.json(receiptsWithUrls);
  });

  const receiptMetadataSchema = z.object({
    merchantName: z.string().max(255).optional().nullable(),
    receiptDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD format").optional().nullable(),
    totalAmount: z.union([z.string(), z.number()]).optional().nullable().transform(v => {
      if (v == null || v === "") return null;
      const n = Number(v);
      if (isNaN(n) || n < 0 || n > 999999.99) return null;
      return n;
    }),
    ocrData: z.string().optional().nullable(),
    ocrConfidence: z.union([z.string(), z.number()]).optional().nullable().transform(v => {
      if (v == null || v === "") return null;
      const n = Number(v);
      if (isNaN(n) || n < 0 || n > 100) return null;
      return n;
    }),
    expenseId: z.union([z.string(), z.number()]).optional().nullable().transform(v => {
      if (v == null || v === "") return null;
      return Number(v);
    }),
  });

  app.post("/api/receipts/upload", isAuthenticated, receiptUpload.single("receipt"), async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const file = req.file;
      if (!file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      if (file.size < 50 * 1024) {
        return res.status(400).json({ message: "File too small. Minimum 50KB required for IRS-quality receipt images." });
      }

      const parsed = receiptMetadataSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid receipt metadata", errors: parsed.error.flatten() });
      }
      const meta = parsed.data;

      const user = await storage.getUser(userId);
      const isPro = user?.subscriptionStatus === "pro" || user?.isVip === true;
      const retentionPolicy = isPro ? "pro" : "basic";

      const expiresAt = new Date();
      if (isPro) {
        expiresAt.setFullYear(expiresAt.getFullYear() + 7);
      } else {
        expiresAt.setDate(expiresAt.getDate() + 90);
      }

      const imageUrl = await uploadToVault(file.buffer, userId, file.mimetype, retentionPolicy);

      let ocrData = null;
      if (meta.ocrData) {
        try { ocrData = JSON.parse(meta.ocrData); } catch { ocrData = null; }
      }

      const receipt = await storage.createReceipt({
        userId,
        imageUrl,
        originalFilename: file.originalname,
        merchantName: meta.merchantName || null,
        receiptDate: meta.receiptDate || null,
        totalAmount: meta.totalAmount ?? null,
        ocrData,
        ocrConfidence: meta.ocrConfidence ?? null,
        retentionPolicy,
        expiresAt,
        expenseId: meta.expenseId ?? null,
      });

      const signedUrl = await getReceiptSignedUrl(imageUrl);
      res.status(201).json({ ...receipt, signedImageUrl: signedUrl });
    } catch (err: any) {
      console.error("Receipt upload error:", err);
      res.status(500).json({ message: err.message || "Upload failed" });
    }
  });

  app.patch("/api/receipts/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const receipt = await storage.getReceipt(Number(req.params.id));
      if (!receipt) {
        return res.status(404).json({ message: "Receipt not found" });
      }
      if (receipt.userId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const updateData: any = {};
      if (req.body.expenseId !== undefined) updateData.expenseId = req.body.expenseId;
      if (req.body.merchantName !== undefined) updateData.merchantName = req.body.merchantName;
      if (req.body.receiptDate !== undefined) updateData.receiptDate = req.body.receiptDate;
      if (req.body.totalAmount !== undefined) updateData.totalAmount = req.body.totalAmount;

      const updated = await storage.updateReceipt(userId, receipt.id, updateData);
      res.json(updated);
    } catch (err: any) {
      console.error("Receipt update error:", err);
      res.status(500).json({ message: err.message || "Update failed" });
    }
  });

  app.delete("/api/receipts/:id", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const receipt = await storage.getReceipt(Number(req.params.id));
    if (!receipt) {
      return res.status(404).json({ message: "Receipt not found" });
    }
    if (receipt.userId !== userId) {
      return res.status(403).json({ message: "Forbidden" });
    }

    if (receipt.imageUrl.startsWith("/objects/")) {
      try { await deleteFromVault(receipt.imageUrl); } catch (e) { console.error("GCS delete error:", e); }
    } else {
      const filePath = path.join(UPLOADS_DIR, path.basename(receipt.imageUrl));
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    await storage.deleteReceipt(userId, receipt.id);
    res.sendStatus(204);
  });

  app.post("/api/scan-receipt", isAuthenticated, receiptUpload.single("receipt"), async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const file = req.file;
      if (!file) {
        return res.status(400).json({ message: "No image uploaded" });
      }

      if (file.size < 50 * 1024) {
        return res.status(400).json({ message: "File too small. Minimum 50KB required for IRS-quality receipt images." });
      }

      const user = await storage.getUser(userId);
      const isPro = user?.subscriptionStatus === "pro" || user?.isVip === true;

      if (!isPro) {
        return res.status(403).json({ message: "AI Receipt Scanner requires a Pro subscription. Upgrade to unlock this feature." });
      }

      const retentionPolicy = "pro";

      const ocrResult = await scanReceiptWithAI(file.buffer, file.mimetype);

      const expiresAt = new Date();
      if (isPro) {
        expiresAt.setFullYear(expiresAt.getFullYear() + 7);
      } else {
        expiresAt.setDate(expiresAt.getDate() + 90);
      }

      const imageUrl = await uploadToVault(file.buffer, userId, file.mimetype, retentionPolicy);

      const receipt = await storage.createReceipt({
        userId,
        imageUrl,
        originalFilename: file.originalname || `receipt-${Date.now()}.jpg`,
        merchantName: ocrResult.merchantName || null,
        receiptDate: ocrResult.date || null,
        totalAmount: ocrResult.totalAmount,
        ocrData: { rawText: ocrResult.rawText, items: ocrResult.items },
        ocrConfidence: ocrResult.confidence,
        retentionPolicy,
        expiresAt,
        expenseId: null,
      });

      const signedUrl = await getReceiptSignedUrl(imageUrl);

      res.json({
        receipt: { ...receipt, signedImageUrl: signedUrl },
        ocr: ocrResult,
      });
    } catch (err: any) {
      console.error("Scan receipt error:", err);
      res.status(500).json({ message: err.message || "Receipt scanning failed" });
    }
  });

  // Accept Terms
  app.post("/api/accept-terms", isAuthenticated, async (req, res) => {
    const schema = z.object({ version: z.string().min(1).default("1.0") });
    const parsed = schema.safeParse(req.body || {});
    const version = parsed.success ? parsed.data.version : "1.0";
    const userId = (req.user as any).claims.sub;
    const ipAddress = req.headers["x-forwarded-for"]?.toString()?.split(",")[0]?.trim() || req.socket.remoteAddress || null;
    const userAgent = req.headers["user-agent"] || null;
    await storage.acceptTerms(userId, version, ipAddress || undefined, userAgent || undefined);
    const { triggerWelcomeEmail } = await import("./lifecycle-manager");
    triggerWelcomeEmail(userId).catch(() => {});
    res.json({ success: true });
  });

  // Request Data Deletion (CCPA)
  app.post("/api/request-data-deletion", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    await storage.deleteUserData(userId);
    res.json({ success: true, message: "All your tax records have been permanently deleted." });
  });

  // Delete Account (Hard Delete - wipes user row and all data)
  app.post("/api/delete-account", isAuthenticated, async (req, res) => {
    const deleteSchema = z.object({
      confirmation: z.string().min(1, "Confirmation text is required"),
    });

    const parsed = deleteSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: parsed.error.errors[0].message,
        field: parsed.error.errors[0].path.join("."),
      });
    }

    const { confirmation } = parsed.data;
    if (confirmation !== "Permanently Delete") {
      return res.status(400).json({
        message: "You must type 'Permanently Delete' to confirm account deletion.",
      });
    }

    const userId = (req.user as any).claims.sub;

    await storage.softDeleteAccount(userId, confirmation);

    req.session.destroy(() => {
      res.json({
        success: true,
        message: "Your account has been deactivated. Your data will be permanently deleted after 30 days. If you change your mind, contact legal@mycabtax.com before then.",
      });
    });
  });

  // Legal & Privacy Support Inquiry
  app.post("/api/support-inquiry", isAuthenticated, async (req, res) => {
    const supportSchema = z.object({
      inquiryType: z.enum([
        "legal_inquiry",
        "data_export",
        "account_deletion",
        "dispute_resolution",
        "security_concern",
      ]),
      message: z.string().min(10, "Please provide at least 10 characters of detail.").max(5000),
    });

    const parsed = supportSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: parsed.error.errors[0].message,
        field: parsed.error.errors[0].path.join("."),
      });
    }

    const userId = (req.user as any).claims.sub;
    const user = await storage.getUser(userId);
    const { inquiryType, message } = parsed.data;

    const typeLabels: Record<string, string> = {
      legal_inquiry: "General Legal Inquiry",
      data_export: "Data Export Request (GDPR/CCPA)",
      account_deletion: "Account Deletion Inquiry",
      dispute_resolution: "Dispute Resolution / Arbitration",
      security_concern: "Report a Security Concern",
    };

    try {
      const { getResendClient } = await import("./resend");
      const { client, fromEmail } = await getResendClient();

      const usaJurisdictionFooter = `
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0 12px;" />
        <p style="color:#999;font-size:11px;line-height:1.4;">
          This communication pertains strictly to My Cab Tax USA services and data. For UK-related inquiries, please contact the UK support branch.<br/>
          My Cab Tax USA &bull; Legal Notices: legal@mycabtax.com &bull; Jurisdiction: State of Delaware, USA
        </p>
      `;

      const submittedAt = new Date().toISOString();

      await client.emails.send({
        from: fromEmail,
        to: "legal@mycabtax.com",
        replyTo: user?.email || undefined,
        subject: `[Legal Support] ${typeLabels[inquiryType]} - User ${userId}`,
        tags: [
          { name: "category", value: "legal_support" },
          { name: "inquiry_type", value: inquiryType },
        ],
        headers: {
          "X-Auth0-User-ID": userId,
        },
        html: `
          <h2>Legal & Privacy Support Inquiry</h2>
          <table style="border-collapse:collapse;width:100%;margin-bottom:16px;">
            <tr><td style="padding:6px 12px;font-weight:bold;background:#f3f4f6;">Inquiry Type</td><td style="padding:6px 12px;">${typeLabels[inquiryType]}</td></tr>
            <tr><td style="padding:6px 12px;font-weight:bold;background:#f3f4f6;">Auth0 User ID</td><td style="padding:6px 12px;font-family:monospace;">${userId}</td></tr>
            <tr><td style="padding:6px 12px;font-weight:bold;background:#f3f4f6;">User Email</td><td style="padding:6px 12px;">${user?.email || "N/A"}</td></tr>
            <tr><td style="padding:6px 12px;font-weight:bold;background:#f3f4f6;">User Name</td><td style="padding:6px 12px;">${user?.firstName || ""} ${user?.lastName || ""}</td></tr>
            <tr><td style="padding:6px 12px;font-weight:bold;background:#f3f4f6;">Subscription</td><td style="padding:6px 12px;">${user?.subscriptionStatus || "basic"}</td></tr>
            <tr><td style="padding:6px 12px;font-weight:bold;background:#f3f4f6;">Submitted At</td><td style="padding:6px 12px;">${submittedAt}</td></tr>
          </table>
          <h3>Message</h3>
          <div style="background:#f9fafb;padding:16px;border-radius:8px;white-space:pre-wrap;">${message.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
          ${usaJurisdictionFooter}
        `,
      });

      if (user?.email) {
        await client.emails.send({
          from: fromEmail,
          to: user.email,
          subject: `My Cab Tax USA - Your ${typeLabels[inquiryType]} Has Been Received`,
          html: `
            <h2>Thank you for contacting the My Cab Tax USA Legal Department.</h2>
            <p>Your inquiry has been logged and assigned to our compliance team.</p>
            <table style="border-collapse:collapse;width:100%;margin:16px 0;">
              <tr><td style="padding:6px 12px;font-weight:bold;background:#f3f4f6;">Inquiry Type</td><td style="padding:6px 12px;">${typeLabels[inquiryType]}</td></tr>
              <tr><td style="padding:6px 12px;font-weight:bold;background:#f3f4f6;">Submitted At</td><td style="padding:6px 12px;">${submittedAt}</td></tr>
              <tr><td style="padding:6px 12px;font-weight:bold;background:#f3f4f6;">Reference ID</td><td style="padding:6px 12px;font-family:monospace;">${userId.slice(0, 8)}-${Date.now().toString(36)}</td></tr>
            </table>
            <p>If this is a request for <strong>data deletion under CCPA</strong>, it will be processed within 30 days in accordance with applicable privacy laws.</p>
            <p>For all other inquiries, our legal team will respond within <strong>5 business days</strong>.</p>
            <p style="color:#666;font-size:12px;">Please do not reply to this email. For follow-up, submit a new inquiry at <a href="https://mycabtaxusa.com/support">mycabtaxusa.com/support</a>.</p>
            ${usaJurisdictionFooter}
          `,
        });
      }

      res.json({ success: true, message: "Your inquiry has been submitted. Our legal team will respond within 5 business days." });
    } catch (error) {
      console.error("Support inquiry email error:", error);
      res.json({ success: true, message: "Your inquiry has been recorded. Our legal team will respond within 5 business days." });
    }
  });

  // checkProAccess middleware
  const checkProAccess = async (req: Request, res: Response, next: NextFunction) => {
    const userId = (req.user as any)?.claims?.sub;
    if (!userId) return res.status(401).json({ message: "Not authenticated" });
    const user = await storage.getUser(userId);
    if (!user || (user.subscriptionStatus !== "pro" && !user.isVip)) {
      return res.status(403).json({
        message: "Upgrade to Pro to unlock Auto-Grossing for Uber and Lyft.",
        upgradeRequired: true,
      });
    }
    next();
  };

  // Auto-Grossing endpoint (Pro only)
  app.post("/api/income/auto-gross", isAuthenticated, checkProAccess, async (req, res) => {
    try {
      const autoGrossSchema = z.object({
        netPayout: z.coerce.number().positive("Net payout must be positive"),
        source: z.string().min(1, "Source is required"),
        date: z.string().min(1, "Date is required"),
        description: z.string().optional().default(""),
        commissionRate: z.coerce.number().min(0).max(1).optional().default(0.25),
      });

      const parsed = autoGrossSchema.parse(req.body);
      const userId = (req.user as any).claims.sub;

      const calculatedGross = parsed.netPayout / (1 - parsed.commissionRate);
      const calculatedFee = calculatedGross - parsed.netPayout;

      const income = await storage.createIncome({
        userId,
        date: parsed.date,
        amount: calculatedGross,
        source: parsed.source,
        description: parsed.description || `Auto-Grossed from $${parsed.netPayout.toFixed(2)} net payout`,
        miles: 0,
        platformFees: calculatedFee,
        isTips: false,
      });

      res.status(201).json({
        income,
        calculation: {
          netPayout: parsed.netPayout,
          commissionRate: parsed.commissionRate,
          calculatedGross: Math.round(calculatedGross * 100) / 100,
          calculatedFee: Math.round(calculatedFee * 100) / 100,
        },
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join(".") });
      }
      throw err;
    }
  });

  app.post("/api/verify-identity", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const verifySchema = z.object({
        fullName: z.string().min(2),
        driversLicenseState: z.string().length(2),
        driversLicenseNumber: z.string().min(1),
        address: z.object({
          street: z.string().min(1),
          city: z.string().min(1),
          state: z.string().length(2),
          zipCode: z.string().min(5).max(10),
        }),
        ssn4: z.string().min(1),
      });

      verifySchema.parse(req.body);
      await storage.verifyUser(userId);
      res.json({ success: true, message: "Identity verified successfully." });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.post("/api/audit-log", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const ipAddress = req.headers["x-forwarded-for"]?.toString()?.split(",")[0]?.trim() || req.socket.remoteAddress || null;
      const userAgent = req.headers["user-agent"] || null;

      const auditLogSchema = z.object({
        action: z.string().min(1, "Action is required"),
        metadata: z.record(z.unknown()).optional(),
      });

      const parsed = auditLogSchema.parse(req.body);

      await storage.createAuditLog({
        userId,
        action: parsed.action,
        ipAddress,
        userAgent,
        metadata: parsed.metadata || null,
      });

      res.json({ success: true, timestamp: new Date().toISOString() });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.post("/api/submissions/generate", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const ipAddress = req.headers["x-forwarded-for"]?.toString()?.split(",")[0]?.trim() || req.socket.remoteAddress || null;
      const userAgent = req.headers["user-agent"] || null;

      const submitSchema = z.object({
        provider: z.enum(["vault_pdf", "efile_irs", "irs_json"]).default("vault_pdf"),
      });

      const parsed = submitSchema.parse(req.body || {});

      const { submissionService } = await import("./submission");
      const result = await submissionService.submitTo(parsed.provider, userId, {
        ipAddress: ipAddress || undefined,
        userAgent: userAgent || undefined,
      });

      if (!result.success) {
        return res.status(result.provider === "efile_irs" ? 501 : 500).json({
          message: result.errorMessage,
          provider: result.provider,
          metadata: result.metadata,
        });
      }

      res.json(result);
    } catch (err: any) {
      console.error("Submission error:", err);
      res.status(500).json({ message: err.message || "Submission failed" });
    }
  });

  app.post("/api/submissions/validate", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const { submissionService } = await import("./submission");
      const { validatePreSubmission } = await import("./submission/pre-submission-validator");

      const data = await submissionService.buildSubmissionData(userId);
      const user = await storage.getUser(userId);
      const result = validatePreSubmission(data, user);

      res.json(result);
    } catch (err: any) {
      console.error("Validation error:", err);
      res.status(500).json({ message: err.message || "Validation failed" });
    }
  });

  app.post("/api/submissions/finalize", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const ipAddress = req.headers["x-forwarded-for"]?.toString()?.split(",")[0]?.trim() || req.socket.remoteAddress || null;
      const userAgent = req.headers["user-agent"] || null;

      const finalizeSchema = z.object({
        taxYear: z.coerce.number().min(2020).max(new Date().getFullYear() + 1),
        selfSelectPin: z.string().regex(/^\d{5}$/, "Self-Select PIN must be exactly 5 digits"),
        ack_1099k_verified: z.literal(true, { errorMap: () => ({ message: "You must verify your 1099-K Gross Income matches your platform records" }) }),
        ack_figures_reviewed: z.literal(true, { errorMap: () => ({ message: "You must confirm all auto-calculated figures are accurate" }) }),
        ack_bookkeeping_tool: z.literal(true, { errorMap: () => ({ message: "You must acknowledge MCTUSA is a bookkeeping tool" }) }),
        perjury_accepted: z.literal(true, { errorMap: () => ({ message: "You must accept the perjury statement" }) }),
        ackStateVerified: z.literal(true, { errorMap: () => ({ message: "You must verify your filing state" }) }),
        affidavitAccepted: z.literal(true, { errorMap: () => ({ message: "You must sign the residency affidavit" }) }),
        filingStateCode: z.string().min(2).max(2).optional(),
        filingStateBucket: z.string().optional(),
        stateAdjustmentAck: z.boolean().optional(),
        boughtNewVehicle: z.boolean().optional(),
      });

      const parsed = finalizeSchema.parse(req.body);

      const isLocked = await storage.isTaxYearLocked(userId, parsed.taxYear);
      if (isLocked) {
        return res.status(409).json({
          message: `Tax year ${parsed.taxYear} is already finalized and locked. Records cannot be modified.`,
          locked: true,
        });
      }

      const { submissionService } = await import("./submission");
      const { validatePreSubmission } = await import("./submission/pre-submission-validator");
      const crypto = await import("crypto");

      const data = await submissionService.buildSubmissionData(userId);
      const user = await storage.getUser(userId);
      const validation = validatePreSubmission(data, user);

      if (!validation.valid) {
        return res.status(422).json({
          message: "Pre-submission validation failed. Please fix errors before finalizing.",
          validation,
        });
      }

      const irsResult = await submissionService.submitTo("irs_json", userId, {
        ipAddress: ipAddress || undefined,
        userAgent: userAgent || undefined,
      });

      const vaultResult = await submissionService.submitTo("vault_pdf", userId, {
        ipAddress: ipAddress || undefined,
        userAgent: userAgent || undefined,
      });

      const submissionHash = (irsResult.metadata as any)?.submissionHash || "unknown";
      const filingId = (irsResult.metadata as any)?.filingId || `MCTUSA-${parsed.taxYear}-${submissionHash.substring(0, 12).toUpperCase()}`;

      const pinHash = crypto.createHash("sha256").update(parsed.selfSelectPin + userId).digest("hex");

      await storage.lockTaxYear(userId, parsed.taxYear);

      const snapshotData: Record<string, unknown> = {
        grossIncome: data.summary.grossIncome,
        totalPlatformFees: data.summary.totalPlatformFees,
        totalDeductions: data.summary.totalDeductions,
        netProfit: data.summary.netProfit,
        selfEmploymentTax: data.summary.selfEmploymentTax,
        totalMiles: data.summary.totalMiles,
        mileageDeduction: data.summary.mileageDeduction,
        mileageRate: data.summary.mileageRate,
        expensesByCategory: data.summary.expensesByCategory,
        incomeBySource: data.summary.incomeBySource,
        seTaxableBase: data.summary.seTaxableBase,
        seDeduction: data.summary.seDeduction,
        estimatedQuarterlyPayment: data.summary.estimatedQuarterlyPayment,
      };

      await storage.createSubmissionReceipt({
        userId,
        taxYear: parsed.taxYear,
        filingId,
        pinHash,
        submissionHash,
        snapshotData,
        grossIncome: data.summary.grossIncome.toFixed(2),
        totalDeductions: data.summary.totalDeductions.toFixed(2),
        netProfit: data.summary.netProfit.toFixed(2),
        selfEmploymentTax: data.summary.selfEmploymentTax.toFixed(2),
        totalMiles: data.summary.totalMiles.toFixed(2),
        incomeCount: data.incomes.length,
        expenseCount: data.expenses.length,
        mileageLogCount: data.mileageLogs.length,
        receiptCount: data.receipts.length,
        ack1099kVerified: true,
        ackFiguresReviewed: true,
        ackBookkeepingTool: true,
        perjuryAccepted: true,
        ackStateVerified: true,
        affidavitAccepted: true,
        filingStateCode: parsed.filingStateCode || user?.stateCode || null,
        filingStateBucket: parsed.filingStateBucket || null,
        ipAddress,
        userAgent,
      });

      await storage.createAuditLog({
        userId,
        action: "submission.finalized",
        ipAddress,
        userAgent,
        metadata: {
          taxYear: parsed.taxYear,
          filingId,
          submissionHash,
          pinHash,
          preparerType: "self_prepared",
          eroRole: "electronic_return_originator",
          ack_1099k_verified: true,
          ack_figures_reviewed: true,
          ack_bookkeeping_tool: true,
          perjury_accepted: true,
          ackStateVerified: true,
          affidavitAccepted: true,
          filingStateCode: parsed.filingStateCode || user?.stateCode || null,
          filingStateBucket: parsed.filingStateBucket || null,
          stateAdjustmentAck: parsed.stateAdjustmentAck || false,
          boughtNewVehicle: parsed.boughtNewVehicle || false,
          irsJsonSuccess: irsResult.success,
          vaultPdfSuccess: vaultResult.success,
          vaultPath: vaultResult.vaultPath || null,
          grossIncome: data.summary.grossIncome,
          netProfit: data.summary.netProfit,
          totalDeductions: data.summary.totalDeductions,
          finalizedAt: new Date().toISOString(),
        },
      });

      res.json({
        success: true,
        filingId,
        submissionHash,
        taxYear: parsed.taxYear,
        locked: true,
        vaultPath: vaultResult.vaultPath,
        validation,
        preparerType: "self_prepared",
      });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, errors: err.errors });
      }
      console.error("Finalize error:", err);
      res.status(500).json({ message: err.message || "Finalization failed" });
    }
  });

  app.get("/api/locked-tax-years", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const locked = await storage.getLockedTaxYears(userId);
    res.json({ lockedTaxYears: locked });
  });

  // Get user subscription status
  app.get("/api/subscription/status", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const user = await storage.getUser(userId);
    const isVip = user?.isVip === true;
    res.json({
      tier: isVip ? "pro" : (user?.subscriptionStatus || "basic"),
      isVip,
      vipLabel: isVip ? (user?.vipLabel || "MCTUSA Founder's Circle") : null,
      stripeCustomerId: user?.stripeCustomerId || null,
      dataRetentionUntil: user?.dataRetentionUntil || null,
    });
  });

  // Stripe integration via Replit connector
  const getStripeClient = async (): Promise<Stripe | null> => {
    try {
      const { getUncachableStripeClient } = await import("./stripeClient");
      return await getUncachableStripeClient();
    } catch {
      const key = process.env.STRIPE_SECRET_KEY;
      if (!key) return null;
      return new Stripe(key, { apiVersion: "2025-04-30.basil" as any });
    }
  };

  // Create Stripe Checkout Session
  app.post("/api/stripe/create-checkout-session", isAuthenticated, async (req, res) => {
    const stripe = await getStripeClient();
    if (!stripe) {
      return res.status(503).json({ message: "Payment processing is not configured yet." });
    }

    try {
      const userId = (req.user as any).claims.sub;
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: "User not found" });

      if (user.subscriptionStatus === "pro" || user.isVip) {
        return res.status(400).json({ message: user.isVip ? "VIP members have complimentary Pro access." : "You are already a Pro subscriber." });
      }

      const { getRegionFromCountry } = await import("./geo-detect");
      const userRegion = getRegionFromCountry(user.detectedCountry);

      // STRIPE_US_PRO_PRICE_ID can be configured separately for USD pricing
      const priceId = userRegion === "US"
        ? (process.env.STRIPE_US_PRO_PRICE_ID || process.env.STRIPE_PRO_PRICE_ID)
        : process.env.STRIPE_PRO_PRICE_ID;
      if (!priceId) {
        return res.status(503).json({ message: "Pro plan pricing is not configured yet." });
      }

      const appUrl = process.env.REPLIT_DEV_DOMAIN
        ? `https://${process.env.REPLIT_DEV_DOMAIN}`
        : process.env.APP_URL || `http://localhost:5000`;

      try {
        const price = await stripe.prices.retrieve(priceId);
        if (price.product && typeof price.product === 'string') {
          const product = await stripe.products.retrieve(price.product);
          if (product.tax_code !== 'txcd_20030000') {
            await stripe.products.update(price.product, { tax_code: 'txcd_20030000' });
          }
        }
      } catch (taxCodeErr: any) {
        console.warn("[stripe] Could not verify product tax code:", taxCodeErr?.message);
      }

      const sessionConfig: any = {
        mode: "subscription",
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${appUrl}/upgrade?upgrade=success`,
        cancel_url: `${appUrl}/upgrade?cancelled=true`,
        metadata: { userId, region: userRegion },
        automatic_tax: { enabled: true },
        invoice_creation: undefined,
        subscription_data: {
          metadata: { userId, region: userRegion },
        },
        tax_id_collection: { enabled: true },
      };

      if (user.stripeCustomerId) {
        sessionConfig.customer = user.stripeCustomerId;
      } else if (user.email) {
        sessionConfig.customer_email = user.email;
      }

      const session = await stripe.checkout.sessions.create(sessionConfig);

      res.json({ url: session.url });
    } catch (error: any) {
      console.error("Stripe checkout error:", error);
      res.status(500).json({ message: "Failed to create checkout session." });
    }
  });

  // Stripe Webhook
  app.post("/api/stripe/webhook", async (req, res) => {
    const stripe = await getStripeClient();
    if (!stripe) return res.status(503).send("Stripe not configured");

    const sig = req.headers["stripe-signature"] as string;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error("STRIPE_WEBHOOK_SECRET not configured");
      return res.status(503).send("Webhook secret not configured");
    }

    let event: Stripe.Event;
    try {
      const rawBody = (req as any).rawBody;
      if (!rawBody) {
        return res.status(400).send("Missing raw body for signature verification");
      }
      event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
    } catch (err: any) {
      console.error("Webhook signature verification failed:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
      const { triggerPaymentReceiptEmail, triggerAbandonedCheckoutEmail } = await import("./lifecycle-manager");

      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object as Stripe.Checkout.Session;
          const userId = session.metadata?.userId;

          if (session.metadata?.type === "final_declaration" && userId) {
            const { finalDeclarations } = await import("@shared/schema");
            const taxYear = session.metadata.taxYear;
            await db.update(finalDeclarations)
              .set({
                status: "paid",
                paidAt: new Date(),
                stripePaymentIntentId: session.payment_intent as string,
              })
              .where(and(eq(finalDeclarations.userId, userId), eq(finalDeclarations.taxYear, taxYear)));
            break;
          }

          if (userId && session.customer) {
            const retentionDate = new Date();
            retentionDate.setFullYear(retentionDate.getFullYear() + 7);
            await storage.updateUserSubscription(userId, {
              subscriptionStatus: "pro",
              stripeCustomerId: session.customer as string,
              stripeSubscriptionId: session.subscription as string,
              dataRetentionUntil: retentionDate,
              vaultEnabled: true,
            });
            const amountTotal = session.amount_total ? `£${(session.amount_total / 100).toFixed(2)}` : "your subscription";
            triggerPaymentReceiptEmail(userId, amountTotal).catch(() => {});

            try {
              await stripe.customers.update(session.customer as string, {
                invoice_settings: {
                  custom_fields: [
                    { name: "VAT Number", value: "GB-PENDING" },
                  ],
                },
              });
            } catch (custErr: any) {
              console.warn("[stripe] Could not update customer invoice settings:", custErr?.message);
            }
          }
          break;
        }
        case "checkout.session.expired": {
          const session = event.data.object as Stripe.Checkout.Session;
          const userId = session.metadata?.userId;
          if (userId) {
            triggerAbandonedCheckoutEmail(userId).catch(() => {});
          }
          break;
        }
        case "customer.subscription.deleted": {
          const subscription = event.data.object as Stripe.Subscription;
          const customerId = subscription.customer as string;
          const user = await storage.getUserByStripeCustomerId(customerId);
          if (user) {
            const graceDate = new Date();
            graceDate.setDate(graceDate.getDate() + 30);
            await storage.updateUserSubscription(user.id, {
              subscriptionStatus: "basic",
              dataRetentionUntil: graceDate,
            });
          }
          break;
        }
      }
    } catch (error) {
      console.error("Webhook processing error:", error);
    }

    res.json({ received: true });
  });

  // ========== TAX JURISDICTION ROUTES ==========

  app.get("/api/jurisdiction", isAuthenticated, async (req: Request, res: Response) => {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ message: "Not authenticated" });
    const user = await storage.getUser(userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    const { NO_INCOME_TAX_STATES, HIGH_LOCAL_TAX_JURISDICTIONS } = await import("./submission/irs-adapter");
    res.json({
      stateCode: user.stateCode || null,
      localTaxEnabled: user.localTaxEnabled || false,
      localTaxJurisdiction: user.localTaxJurisdiction || null,
      partialYearResident: user.partialYearResident || false,
      partialYearStates: (user.partialYearStates as string[]) || [],
      tipIncomeAmount: user.tipIncomeAmount || null,
      noIncomeTaxStates: NO_INCOME_TAX_STATES,
      localJurisdictions: HIGH_LOCAL_TAX_JURISDICTIONS,
    });
  });

  app.patch("/api/user/segment", isAuthenticated, async (req: Request, res: Response) => {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ message: "Not authenticated" });

    const segmentSchema = z.object({
      segment: z.enum(["taxi", "delivery", "hybrid"]),
    });
    const parsed = segmentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid segment" });

    await storage.updateUserSegment(userId, parsed.data.segment);
    res.json({ success: true, segment: parsed.data.segment });
  });

  app.post("/api/user/update-type", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const rawType = String(req.body.driverType || "").toLowerCase();

      let driverType = "hybrid";
      if (rawType.includes("taxi")) {
        driverType = "taxi";
      } else if (rawType.includes("delivery")) {
        driverType = "delivery";
      }

      console.log("Mapped input:", rawType, "to DB value:", driverType);

      await db.update(users)
        .set({ userSegment: driverType })
        .where(eq(users.id, userId));

      res.json({ success: true, driverType });
    } catch (error) {
      console.error("Save error:", error);
      res.status(500).json({ message: "Failed to save selection" });
    }
  });

  app.patch("/api/jurisdiction", isAuthenticated, async (req: Request, res: Response) => {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ message: "Not authenticated" });

    const VALID_STATES = [
      "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
      "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
      "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC",
    ];
    const { HIGH_LOCAL_TAX_JURISDICTIONS } = await import("./submission/irs-adapter");

    const jurisdictionSchema = z.object({
      stateCode: z.string().refine(s => VALID_STATES.includes(s), { message: "Invalid state code" }).nullable(),
      localTaxEnabled: z.boolean(),
      localTaxJurisdiction: z.string().refine(s => s in HIGH_LOCAL_TAX_JURISDICTIONS, { message: "Invalid local jurisdiction" }).nullable(),
      partialYearResident: z.boolean().optional(),
      partialYearStates: z.array(z.string().refine(s => VALID_STATES.includes(s))).optional(),
      tipIncomeAmount: z.string().nullable().optional(),
    });

    const parsed = jurisdictionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid jurisdiction data", errors: parsed.error.flatten().fieldErrors });
    }

    await storage.updateUserJurisdiction(userId, {
      stateCode: parsed.data.stateCode ?? undefined,
      localTaxEnabled: parsed.data.localTaxEnabled,
      localTaxJurisdiction: parsed.data.localTaxJurisdiction ?? undefined,
      partialYearResident: parsed.data.partialYearResident,
      partialYearStates: parsed.data.partialYearStates,
      tipIncomeAmount: parsed.data.tipIncomeAmount ?? undefined,
    });
    res.json({ success: true });
  });

  app.post("/api/local-tax/generate", isAuthenticated, async (req: Request, res: Response) => {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ message: "Not authenticated" });
    try {
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: "User not found" });
      if (!user.localTaxEnabled) {
        return res.status(400).json({ message: "Local tax filing is not enabled. Enable it in Settings > Tax Filing Jurisdiction first." });
      }
      if (!user.localTaxJurisdiction) {
        return res.status(400).json({ message: "No local jurisdiction selected. Select one in Settings > Tax Filing Jurisdiction first." });
      }
      const { HIGH_LOCAL_TAX_JURISDICTIONS } = await import("./submission/irs-adapter");
      const jurisdictionInfo = HIGH_LOCAL_TAX_JURISDICTIONS[user.localTaxJurisdiction];
      if (!jurisdictionInfo) {
        return res.status(400).json({ message: `Invalid local jurisdiction: ${user.localTaxJurisdiction}` });
      }

      const { LocalTaxProvider } = await import("./submission/local-tax-provider");
      const { submissionService } = await import("./submission/index");
      const data = await submissionService.buildSubmissionData(userId);
      const provider = new LocalTaxProvider();
      const pdfBuffer = provider.generateLocalEITPDF(
        data,
        `MCTUSA-LOCAL-${data.taxYear}`,
        jurisdictionInfo,
        user.localTaxJurisdiction
      );
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename=MCTUSA_Local_Tax_${data.taxYear}.pdf`);
      res.send(pdfBuffer);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to generate local tax PDF" });
    }
  });

  app.get("/api/state-info/:stateCode", async (req: Request, res: Response) => {
    try {
      const stateCode = String(req.params.stateCode);
      const { getStateConfig } = await import("./submission/state-engine");
      const { getLiveRate, getActiveProviderName } = await import("./submission/tax-rate-provider");
      const config = getStateConfig(stateCode);
      if (!config) {
        return res.status(404).json({ message: "State not found" });
      }

      const liveResult = await getLiveRate(stateCode, 50000);
      const bucketColors: Record<string, string> = {
        None: "blue",
        Flat: "green",
        Graduated: "yellow",
        Decoupled: "red",
      };

      res.json({
        stateCode,
        stateName: config.name,
        taxType: config.tax_type,
        topRate: liveResult.topRate,
        effectiveRate: liveResult.effectiveRate,
        estimatedTaxAt50k: liveResult.estimatedTax,
        bucketColor: bucketColors[config.tax_type] || "gray",
        hasLocalTax: config.has_local_tax || false,
        isDecoupled: config.tax_type === "Decoupled",
        decoupledRules: config.decoupled_rules || [],
        brackets: config.brackets || [],
        provider: liveResult.provider,
        isLive: liveResult.isLive,
        cachedAt: liveResult.cachedAt,
        expiresAt: liveResult.expiresAt,
        rateChanged: liveResult.rateChanged,
        rateChangePct: liveResult.rateChangePct,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to get state info" });
    }
  });

  app.get("/api/live-rate/:stateCode", async (req: Request, res: Response) => {
    try {
      const { stateCode } = req.params;
      const income = Number(req.query.income) || 50000;
      const zipCode = typeof req.query.zipCode === 'string' ? req.query.zipCode : undefined;
      const forceRefresh = req.query.refresh === "true";

      const { getLiveRate } = await import("./submission/tax-rate-provider");
      const result = await getLiveRate(stateCode, income, zipCode, forceRefresh);

      if (!result.stateName || result.stateName === "Unknown") {
        return res.status(404).json({ message: "State not found" });
      }

      const bucketColors: Record<string, string> = {
        None: "blue",
        Flat: "green",
        Graduated: "yellow",
        Decoupled: "red",
      };

      res.json({
        ...result,
        bucketColor: bucketColors[result.taxType] || "gray",
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to get live rate" });
    }
  });

  app.get("/api/tax-provider/status", async (_req: Request, res: Response) => {
    try {
      const { getProviderStatus, getActiveProviderName } = await import("./submission/tax-rate-provider");
      const { getSentinelStatus } = await import("./submission/compliance-sentinel");
      res.json({
        activeProvider: getActiveProviderName(),
        providers: getProviderStatus(),
        sentinel: getSentinelStatus(),
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to get provider status" });
    }
  });

  app.post("/api/tax-provider/refresh", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { refreshAllRates } = await import("./submission/tax-rate-provider");
      const result = await refreshAllRates(Number(req.body.income) || 50000);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to refresh rates" });
    }
  });

  app.get("/api/compliance-alerts", async (_req: Request, res: Response) => {
    try {
      const { getRecentAlerts } = await import("./submission/tax-rate-provider");
      const alerts = await getRecentAlerts(50);
      res.json(alerts);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to get alerts" });
    }
  });

  app.post("/api/compliance-alerts/:id/dismiss", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { dismissAlert } = await import("./submission/tax-rate-provider");
      await dismissAlert(Number(req.params.id));
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to dismiss alert" });
    }
  });

  app.post("/api/compliance-alerts/:id/read", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { markAlertRead } = await import("./submission/tax-rate-provider");
      await markAlertRead(Number(req.params.id));
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to mark alert read" });
    }
  });

  app.post("/api/sentinel/scan", isAuthenticated, async (_req: Request, res: Response) => {
    try {
      const { runSentinelScan } = await import("./submission/compliance-sentinel");
      const result = await runSentinelScan();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to run sentinel scan" });
    }
  });

  app.get("/api/sentinel/status", async (_req: Request, res: Response) => {
    try {
      const { getSentinelStatus } = await import("./submission/compliance-sentinel");
      res.json(getSentinelStatus());
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to get sentinel status" });
    }
  });

  app.get("/api/submission-readiness", isAuthenticated, async (req: Request, res: Response) => {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ message: "Not authenticated" });
    try {
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: "User not found" });

      const { analyzeJurisdiction, getSubmissionReadinessChecklist } = await import("./submission/jurisdiction-rules");
      const { submissionService } = await import("./submission/index");
      const data = await submissionService.buildSubmissionData(userId);

      const analysis = analyzeJurisdiction({
        stateCode: user.stateCode || null,
        localTaxEnabled: user.localTaxEnabled || false,
        localTaxJurisdiction: user.localTaxJurisdiction || null,
        partialYearResident: user.partialYearResident || false,
        partialYearStates: (user.partialYearStates as string[]) || [],
        netProfit: data.summary.netProfit,
        grossIncome: data.summary.grossIncome,
        tipIncomeAmount: user.tipIncomeAmount ? Number(user.tipIncomeAmount) : 0,
      });

      const checklist = getSubmissionReadinessChecklist(analysis);

      res.json({
        checklist,
        stateRules: analysis.stateRules,
        filingComponents: analysis.filingComponents,
        stateInfo: {
          stateCode: analysis.stateCode,
          stateName: analysis.stateName,
          taxType: analysis.taxType,
          bucketLabel: analysis.bucketLabel,
          requiresStateAdjustment: analysis.requiresStateAdjustment,
          decoupledRules: analysis.decoupledRules,
        },
        tipAdjustments: {
          federalTipExemption: analysis.federalTipExemption,
          stateTipInclusion: analysis.stateTipInclusion,
          noTaxOnTipsApplied: analysis.noTaxOnTipsEligible,
          stateDecoupled: analysis.tipsDecoupled,
        },
        stateTaxEstimate: {
          topRate: analysis.stateTaxRate,
          effectiveRate: analysis.effectiveRate,
          estimate: analysis.stateTaxOwed,
        },
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to generate readiness check" });
    }
  });

  // ========== AUDIT CENTER ROUTES ==========

  app.get("/api/audit-notices", isAuthenticated, async (req: Request, res: Response) => {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ message: "Not authenticated" });
    const notices = await storage.getAuditNotices(userId);
    res.json(notices);
  });

  app.post("/api/audit-notices/upload", isAuthenticated, receiptUpload.single("file"), async (req: Request, res: Response) => {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ message: "Not authenticated" });
    const user = await storage.getUser(userId);
    if (!user || user.subscriptionStatus !== "pro") {
      return res.status(403).json({ message: "Audit Center is a Pro feature. Upgrade to access." });
    }
    const file = req.file;
    if (!file) return res.status(400).json({ message: "No file uploaded" });

    const imageUrl = await uploadToVault(file.buffer, userId, file.mimetype, "pro");
    const notice = await storage.createAuditNotice({
      userId,
      imageUrl,
      originalFilename: file.originalname,
      noticeType: (req.body?.noticeType as string) || null,
      notes: (req.body?.notes as string) || null,
    });

    await storage.createAuditLog({
      userId,
      action: "audit_notice_uploaded",
      ipAddress: req.ip || null,
      userAgent: req.headers["user-agent"] || null,
      metadata: { noticeId: notice.id, filename: file.originalname },
    });

    res.json(notice);
  });

  app.post("/api/audit-dossier/generate", isAuthenticated, async (req: Request, res: Response) => {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ message: "Not authenticated" });
    const user = await storage.getUser(userId);
    if (!user || user.subscriptionStatus !== "pro") {
      return res.status(403).json({ message: "Audit Dossier is a Pro feature. Upgrade to access." });
    }

    const { generateAuditDossierPDF } = await import("./submission/audit-dossier");

    const [expensesList, incomesList, mileageLogsList, receiptsList] = await Promise.all([
      storage.getExpenses(userId),
      storage.getIncomes(userId),
      storage.getMileageLogs(userId),
      storage.getReceipts(userId),
    ]);

    const summary = await storage.getTaxSummary(userId);
    const taxYear = new Date().getFullYear();

    const submissionData = {
      userId,
      taxYear,
      generatedAt: new Date(),
      summary,
      expenses: expensesList,
      incomes: incomesList,
      mileageLogs: mileageLogsList,
      receipts: receiptsList,
    };

    const pdfBuffer = generateAuditDossierPDF(submissionData);
    const vaultPath = await uploadToVault(pdfBuffer, userId, "application/pdf", "pro");

    await storage.createAuditLog({
      userId,
      action: "audit_dossier_generated",
      ipAddress: req.ip || null,
      userAgent: req.headers["user-agent"] || null,
      metadata: {
        taxYear,
        expenseCount: expensesList.length,
        incomeCount: incomesList.length,
        mileageLogCount: mileageLogsList.length,
        receiptCount: receiptsList.length,
        vaultPath,
      },
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="MCTUSA_Audit_Dossier_${taxYear}.pdf"`);
    res.send(pdfBuffer);
  });

  // ========== ODOMETER ROUTES ==========

  app.post("/api/dl/upload-scan", isAuthenticated, receiptUpload.single("file"), async (req: Request, res: Response) => {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ message: "Not authenticated" });
    const file = req.file;
    if (!file) return res.status(400).json({ message: "No file uploaded" });

    try {
      const imageUrl = await uploadToVault(file.buffer, userId, file.mimetype, "pro");
      const { scanDriversLicenseWithAI } = await import("./receipt-ocr");
      const ocrResult = await scanDriversLicenseWithAI(file.buffer, file.mimetype);

      await storage.updateUser(userId, {
        dlImageUrl: imageUrl,
        dlStateOcr: ocrResult.stateCode || null,
      });

      res.json({
        imageUrl,
        ocrResult: {
          stateCode: ocrResult.stateCode,
          stateName: ocrResult.stateName,
          fullName: ocrResult.fullName,
          confidence: ocrResult.confidence,
        },
      });
    } catch (err: any) {
      console.error("DL scan error:", err);
      res.status(500).json({ message: err.message || "Failed to scan driver's license" });
    }
  });

  app.post("/api/dl/utility-bill", isAuthenticated, receiptUpload.single("file"), async (req: Request, res: Response) => {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ message: "Not authenticated" });
    const file = req.file;
    if (!file) return res.status(400).json({ message: "No file uploaded" });

    try {
      const imageUrl = await uploadToVault(file.buffer, userId, file.mimetype, "pro");
      await storage.updateUser(userId, { utilityBillUrl: imageUrl });
      res.json({ imageUrl });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to upload utility bill" });
    }
  });

  app.patch("/api/dl/residency", isAuthenticated, async (req: Request, res: Response) => {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ message: "Not authenticated" });

    const schema = z.object({
      residencyStatus: z.enum(["confirmed", "moved", "clarified"]),
      movedDuringYear: z.boolean().optional(),
      movedFromState: z.string().optional(),
      movedToState: z.string().optional(),
      movedDate: z.string().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid data", errors: parsed.error.flatten() });

    await storage.updateUser(userId, {
      residencyStatus: parsed.data.residencyStatus,
      movedDuringYear: parsed.data.movedDuringYear || false,
      movedFromState: parsed.data.movedFromState || null,
      movedToState: parsed.data.movedToState || null,
      movedDate: parsed.data.movedDate || null,
    });

    res.json({ success: true });
  });

  app.post("/api/odometer/upload-photo", isAuthenticated, receiptUpload.single("file"), async (req: Request, res: Response) => {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ message: "Not authenticated" });
    const file = req.file;
    if (!file) return res.status(400).json({ message: "No file uploaded" });
    const imageUrl = await uploadToVault(file.buffer, userId, file.mimetype, "pro");
    res.json({ imageUrl });
  });

  app.get("/api/odometer-checkins", isAuthenticated, async (req: Request, res: Response) => {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ message: "Not authenticated" });
    const vehicleId = req.query.vehicleId ? Number(req.query.vehicleId) : undefined;
    const checkins = await storage.getOdometerCheckins(userId, vehicleId);
    res.json(checkins);
  });

  app.post("/api/odometer-checkins", isAuthenticated, async (req: Request, res: Response) => {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ message: "Not authenticated" });
    const { insertOdometerCheckinSchema } = await import("@shared/schema");
    const parsed = insertOdometerCheckinSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid data", errors: parsed.error.flatten() });
    const checkin = await storage.createOdometerCheckin({ ...parsed.data, userId });
    res.json(checkin);
  });

  const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "founder@mycabtax.com";

  async function requireAdmin(req: Request, res: Response): Promise<boolean> {
    const userId = (req as any).user?.id;
    if (!userId) { res.status(401).json({ message: "Not authenticated" }); return false; }
    const user = await storage.getUser(userId);
    if (!user || !user.email || user.email.toLowerCase() !== ADMIN_EMAIL) {
      res.status(403).json({ message: "Forbidden" });
      return false;
    }
    return true;
  }

  app.get("/api/admin/metrics", isAuthenticated, async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;

    try {
      const metrics = await storage.getAdminMetrics();
      res.json(metrics);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/admin/lifecycle-metrics", isAuthenticated, async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;

    try {
      const { lifecycleEmails } = await import("@shared/schema");
      const allEmails = await db.select().from(lifecycleEmails);
      const byType: Record<string, number> = {};
      const bySegment: Record<string, number> = {};
      for (const e of allEmails) {
        byType[e.emailType] = (byType[e.emailType] || 0) + 1;
        const seg = e.segment || "unknown";
        bySegment[seg] = (bySegment[seg] || 0) + 1;
      }
      res.json({ total: allEmails.length, byType, bySegment });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/email-domain/add", isAuthenticated, async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;

    const { domain } = req.body;
    if (!domain || typeof domain !== "string") {
      return res.status(400).json({ message: "Domain is required" });
    }

    try {
      const { getResendClient } = await import("./resend");
      const { client } = await getResendClient();
      const result = await client.domains.create({ name: domain.trim().toLowerCase() });
      res.json(result);
    } catch (error: any) {
      const msg = error.message || "Unknown error";
      const status = msg.includes("already") ? 409 : 500;
      res.status(status).json({ message: msg });
    }
  });

  app.get("/api/admin/email-domain/status", isAuthenticated, async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;

    try {
      const { getResendClient } = await import("./resend");
      const { client } = await getResendClient();
      const domainsResult = await client.domains.list();
      res.json(domainsResult);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/email-domain/verify", isAuthenticated, async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;

    const { domainId } = req.body;
    if (!domainId || typeof domainId !== "string") {
      return res.status(400).json({ message: "Domain ID is required" });
    }

    try {
      const { getResendClient } = await import("./resend");
      const { client } = await getResendClient();
      const result = await client.domains.verify(domainId);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/admin/email-domain/dns-records", isAuthenticated, async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;

    try {
      const { getResendClient } = await import("./resend");
      const { client } = await getResendClient();
      const domainsResult = await client.domains.list();
      const domains = (domainsResult as any)?.data || [];

      const domainDetails = [];
      for (const d of domains) {
        try {
          const detail = await client.domains.get(d.id);
          domainDetails.push(detail);
        } catch {
          domainDetails.push(d);
        }
      }

      res.json({ domains: domainDetails });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ===== Tax Export Engine =====
  const {
    buildExportSummary,
    generateExpensesCsv,
    generateMileageCsv,
    generateIncomeCsv,
    createReceiptVaultZip,
  } = await import("./export-engine");

  app.get("/api/export/summary", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const taxYear = parseInt(req.query.year as string) || new Date().getFullYear();
      const summary = await buildExportSummary(userId, taxYear);
      res.json(summary);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/export/expenses-csv", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const taxYear = parseInt(req.query.year as string) || new Date().getFullYear();
      const expenses = await storage.getExpenses(userId);
      const csv = generateExpensesCsv(expenses, taxYear);
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename=MCTUSA_Expenses_${taxYear}.csv`);
      res.send(csv);
      if (taxYear === 2026) {
        db.update(users).set({ hasExported2026: true, updatedAt: new Date() }).where(eq(users.id, userId)).catch(() => {});
      }
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/export/mileage-csv", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const taxYear = parseInt(req.query.year as string) || new Date().getFullYear();
      const logs = await storage.getMileageLogs(userId);
      const csv = generateMileageCsv(logs, taxYear);
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename=MCTUSA_Mileage_${taxYear}.csv`);
      res.send(csv);
      if (taxYear === 2026) {
        db.update(users).set({ hasExported2026: true, updatedAt: new Date() }).where(eq(users.id, userId)).catch(() => {});
      }
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/export/income-csv", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const taxYear = parseInt(req.query.year as string) || new Date().getFullYear();
      const incomes = await storage.getIncomes(userId);
      const csv = generateIncomeCsv(incomes, taxYear);
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename=MCTUSA_Income_${taxYear}.csv`);
      res.send(csv);
      if (taxYear === 2026) {
        db.update(users).set({ hasExported2026: true, updatedAt: new Date() }).where(eq(users.id, userId)).catch(() => {});
      }
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/export/receipt-vault-zip", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const user = await storage.getUser(userId);
      if (!user || user.subscriptionStatus !== "pro") {
        return res.status(403).json({ message: "Receipt Vault ZIP is a Pro feature. Please upgrade your subscription." });
      }
      const taxYear = parseInt(req.query.year as string) || new Date().getFullYear();
      const zipBuffer = await createReceiptVaultZip(userId, taxYear);
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename=MCTUSA_Receipt_Vault_${taxYear}.zip`);
      res.send(zipBuffer);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/ai-chat", isAuthenticated, async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;

    const { message, history } = req.body;
    if (!message || typeof message !== "string") {
      return res.status(400).json({ message: "Message is required" });
    }

    try {
      const { GoogleGenAI } = await import("@google/genai");
      const { count } = await import("drizzle-orm");
      const { lifecycleEmails } = await import("@shared/schema");

      if (!process.env.AI_INTEGRATIONS_GEMINI_API_KEY) {
        return res.status(503).json({ message: "AI service not configured" });
      }
      const ai = new GoogleGenAI({
        apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
        httpOptions: {
          apiVersion: "",
          baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
        },
      });

      const metrics = await storage.getAdminMetrics();

      const [emailStats] = await db.select({ count: count() }).from(lifecycleEmails);

      let segmentBreakdown = { taxi: 0, delivery: 0, hybrid: 0, unset: 0 };
      try {
        const segUsers = await db.select({
          segment: users.userSegment,
        }).from(users);
        for (const u of segUsers) {
          if (u.segment === "taxi") segmentBreakdown.taxi++;
          else if (u.segment === "delivery") segmentBreakdown.delivery++;
          else if (u.segment === "hybrid") segmentBreakdown.hybrid++;
          else segmentBreakdown.unset++;
        }
      } catch {}

      let stateBreakdown: Record<string, number> = {};
      try {
        const stateUsers = await db.select({
          stateCode: users.stateCode,
        }).from(users);
        for (const u of stateUsers) {
          const st = u.stateCode || "Unknown";
          stateBreakdown[st] = (stateBreakdown[st] || 0) + 1;
        }
      } catch {}

      const topStates = Object.entries(stateBreakdown)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([state, ct]) => `${state}: ${ct}`)
        .join(", ");

      const systemPrompt = `Act as the MCTUSA Executive Assistant. Your goal is to help the owners manage the driver fleet and tax compliance. Follow these rules strictly:

SEGMENT AWARENESS: Always distinguish between 'Taxi/Rideshare' and 'Delivery/Courier'. If an owner asks to send a tip, ensure the content matches the driver's industry. Hybrid drivers use multi-app (e.g., Uber + DoorDash simultaneously).

FINANCIAL GUARDRAILS: You have access to aggregate user counts, deduction totals, and compliance status. You NEVER share raw PII (Social Security Numbers, Full Addresses, phone numbers, or email addresses) in the chat. If asked for individual user details, provide only aggregate or anonymized data.

THE 7-YEAR VAULT: If an owner asks about data safety, emphasize that all records are 'Immutable' and stored for the 7-year IRS statute of limitations.

TONE: Be professional, high-energy, and data-driven. Use 'US English' formatting. Use dollar amounts with commas. Use precise numbers.

CONFIRMATION PROTOCOL: For any action that would send an email, change a user's status, generate codes, or modify data, you must summarize the action and ask: 'Shall I execute this for [X] users?' Note: You cannot actually execute these actions yet - describe what would happen and recommend the owner take the action manually or request the engineering team implement it.

CURRENT LIVE METRICS (real-time from database):
- Total Users: ${metrics.totalUsers}
- Pro Subscribers: ${metrics.proUsers}
- Verified Users: ${metrics.verifiedUsers}
- Income Records: ${metrics.totalIncomeRecords}
- Expense Records: ${metrics.totalExpenseRecords}
- Mileage Logs: ${metrics.totalMileageLogs}
- Taxes Filed: ${metrics.taxesFiled}
- Audit Log Entries: ${metrics.auditLogEntries}
- Active Compliance Alerts: ${metrics.activeComplianceAlerts}
- Total Lifecycle Emails Sent: ${emailStats.count}

SEGMENT BREAKDOWN:
- Taxi/Rideshare: ${segmentBreakdown.taxi}
- Delivery Courier: ${segmentBreakdown.delivery}
- Hybrid (Multi-App): ${segmentBreakdown.hybrid}
- Not Yet Selected: ${segmentBreakdown.unset}

TOP STATES BY USER COUNT: ${topStates || "No state data available"}

2026 TAX LAW CONTEXT:
- IRS Mileage Rate: $0.725/mile (72.5 cents, up 2.5 cents from 2025)
- SALT Deduction Cap: $40,000 (increased from $10,000)
- 1099-K Threshold: $20,000 gross / 200+ transactions (reverted from $600)
- Tips Exemption: No Tax on Tips (OBBBA Sec. 101) - tip income exempt from federal income tax
- SE Tax Rate: 15.3% (12.4% Social Security + 2.9% Medicare)
- IRS Direct File: Discontinued for 2026
- Schedule 1-A: New form for tip income reporting`;

      const chatHistory = Array.isArray(history) ? history.map((h: any) => ({
        role: h.role === "assistant" ? "model" : "user",
        parts: [{ text: h.content }],
      })) : [];

      const contents = [
        ...chatHistory,
        { role: "user", parts: [{ text: message }] },
      ];

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const stream = await ai.models.generateContentStream({
        model: "gemini-2.5-flash",
        contents,
        config: {
          systemInstruction: systemPrompt,
        },
      });

      let fullResponse = "";
      for await (const chunk of stream) {
        const text = chunk.text || "";
        if (text) {
          fullResponse += text;
          res.write(`data: ${JSON.stringify({ content: text })}\n\n`);
        }
      }

      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } catch (error: any) {
      console.error("Admin AI chat error:", error);
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: "AI request failed" })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ message: error.message });
      }
    }
  });

  // ==================== DHIP Currency Engine Routes ====================
  
  app.get("/api/currency/status", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).claims.sub;
      const { getDHIPStatus } = await import("./currency-engine");
      const status = await getDHIPStatus(userId);
      res.json(status);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/currency/rates", isAuthenticated, async (_req: Request, res: Response) => {
    try {
      const { getAllRates } = await import("./currency-engine");
      const rates = await getAllRates();
      res.json(rates);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/currency/sync", isAuthenticated, async (_req: Request, res: Response) => {
    try {
      const { syncForexRates } = await import("./currency-engine");
      const count = await syncForexRates();
      res.json({ synced: count, message: `Synced ${count} currency rates` });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/currency/convert", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const schema = z.object({
        amount: z.coerce.number().positive(),
        from: z.string().min(3).max(3),
        to: z.string().min(3).max(3),
        benchmark: z.string().min(3).max(3).optional().default("USD"),
      });
      const { amount, from, to, benchmark } = schema.parse(req.body);
      const { convertCurrency } = await import("./currency-engine");
      const result = await convertCurrency(amount, from, to, benchmark);
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/currency/vault-lock", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).claims.sub;

      const schema = z.object({
        entityType: z.enum(["expense", "income"]),
        entityId: z.coerce.number(),
        originalCurrency: z.string().min(3).max(3),
        originalAmount: z.coerce.number().positive(),
        benchmarkAsset: z.string().min(3).max(3).optional().default("USD"),
      });
      const data = schema.parse(req.body);

      if (data.entityType === "expense") {
        const expense = await storage.getExpense(data.entityId);
        if (!expense || expense.userId !== userId) {
          return res.status(403).json({ message: "Expense not found or access denied" });
        }
      } else {
        const income = await storage.getIncome(data.entityId);
        if (!income || income.userId !== userId) {
          return res.status(403).json({ message: "Income not found or access denied" });
        }
      }

      const { lockTransaction, getVaultLocks } = await import("./currency-engine");
      const existingLocks = await getVaultLocks(userId);
      const alreadyLocked = existingLocks.some(
        l => l.entityType === data.entityType && l.entityId === data.entityId
      );
      if (alreadyLocked) {
        return res.status(409).json({ message: "This transaction is already vault-locked" });
      }

      const result = await lockTransaction(
        userId, data.entityType, data.entityId,
        data.originalCurrency, data.originalAmount, data.benchmarkAsset
      );
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.get("/api/currency/vault-locks", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).claims.sub;
      const { getVaultLocks } = await import("./currency-engine");
      const locks = await getVaultLocks(userId);
      res.json(locks);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/currency/rate/:from/:to", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { from, to } = req.params;
      const { getRate } = await import("./currency-engine");
      const rate = await getRate(from.toUpperCase(), to.toUpperCase());
      if (!rate) return res.status(404).json({ message: `No rate found for ${from} -> ${to}` });
      res.json({ from: from.toUpperCase(), to: to.toUpperCase(), rate });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ==================== Currency Anchor Routes ====================

  app.get("/api/anchor/status", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).claims.sub;
      const { getAnchorStatus } = await import("./currency-anchor");
      const status = await getAnchorStatus(userId);
      res.json(status);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/anchor/run", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).claims.sub;
      const { SUPPORTED_CURRENCIES } = await import("@shared/schema");
      const { currency } = z.object({
        currency: z.string().min(3).max(3).refine(
          (c) => (SUPPORTED_CURRENCIES as readonly string[]).includes(c),
          { message: "Unsupported currency code" }
        ),
      }).parse(req.body);
      const { anchorUserTransactions } = await import("./currency-anchor");
      const result = await anchorUserTransactions(userId, currency);
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // ==================== Audit Sentinel Routes ====================

  app.get("/api/audit-risk", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).claims.sub;
      const { analyzeAuditRisk } = await import("./audit-sentinel");
      const result = await analyzeAuditRisk(userId);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ==================== Multi-Gig Bridge (Sync) Routes ====================

  app.get("/api/gig-sync/entries", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).claims.sub;
      const { gigSyncEntries } = await import("@shared/schema");
      const entries = await db.select().from(gigSyncEntries).where(eq(gigSyncEntries.userId, userId));
      res.json(entries);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/gig-sync/upload", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).claims.sub;
      const schema = z.object({
        platform: z.string().min(1),
        entries: z.array(z.object({
          date: z.string(),
          amount: z.string(),
          description: z.string().optional().default(""),
          tips: z.string().optional().default("0"),
          platformFees: z.string().optional().default("0"),
          miles: z.string().optional().default("0"),
          tripType: z.string().optional().default(""),
          rawCsvRow: z.any().optional(),
        })),
      });
      const { platform, entries } = schema.parse(req.body);
      const { gigSyncEntries } = await import("@shared/schema");

      const inserted = [];
      for (const entry of entries) {
        const [row] = await db.insert(gigSyncEntries).values({
          userId,
          platform,
          date: entry.date,
          amount: entry.amount,
          description: entry.description,
          tips: entry.tips,
          platformFees: entry.platformFees,
          miles: entry.miles,
          tripType: entry.tripType,
          rawCsvRow: entry.rawCsvRow || null,
        }).returning();
        inserted.push(row);
      }
      res.json({ imported: inserted.length, entries: inserted });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/gig-sync/import-to-income", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).claims.sub;
      const { entryIds } = z.object({ entryIds: z.array(z.number()) }).parse(req.body);
      const { gigSyncEntries } = await import("@shared/schema");

      let imported = 0;
      for (const id of entryIds) {
        const [entry] = await db.select().from(gigSyncEntries)
          .where(and(eq(gigSyncEntries.id, id), eq(gigSyncEntries.userId, userId)));
        if (!entry || entry.importedToIncome) continue;

        await storage.createIncome({
          userId,
          date: entry.date,
          amount: entry.amount,
          source: entry.platform,
          description: entry.description || `${entry.platform} earnings`,
          miles: entry.miles || "0",
          platformFees: entry.platformFees || "0",
          isTips: false,
        });

        await db.update(gigSyncEntries)
          .set({ importedToIncome: true })
          .where(eq(gigSyncEntries.id, id));
        imported++;
      }

      if (parseFloat((await db.select().from(gigSyncEntries).where(and(eq(gigSyncEntries.userId, userId))))[0]?.tips || "0") > 0) {
      }

      res.json({ imported });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/gig-sync/entries", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).claims.sub;
      const { gigSyncEntries } = await import("@shared/schema");
      await db.delete(gigSyncEntries).where(eq(gigSyncEntries.userId, userId));
      res.json({ message: "All sync entries cleared" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ==================== Region Config ====================

  app.get("/api/user/region-config", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).claims.sub;
      const user = await storage.getUser(userId);
      const { getRegionConfig } = await import("./geo-detect");
      const config = getRegionConfig(user?.detectedCountry);
      res.json(config);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/user/detected-country", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).claims.sub;
      const { countryCode } = z.object({ countryCode: z.string().length(2) }).parse(req.body);
      await storage.updateUser(userId, { detectedCountry: countryCode.toUpperCase() });
      const { getRegionConfig } = await import("./geo-detect");
      const config = getRegionConfig(countryCode.toUpperCase());
      res.json(config);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // ==================== Simplified View Toggle ====================

  app.patch("/api/user/simplified-view", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).claims.sub;
      const { enabled } = z.object({ enabled: z.boolean() }).parse(req.body);
      await storage.updateUser(userId, { simplifiedView: enabled });
      res.json({ simplifiedView: enabled });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // ==================== MTD Quarterly Submissions ====================

  app.get("/api/quarterly-submissions", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).claims.sub;
      const { quarterlySubmissions } = await import("@shared/schema");
      const subs = await db.select().from(quarterlySubmissions).where(eq(quarterlySubmissions.userId, userId)).orderBy(quarterlySubmissions.taxYear, quarterlySubmissions.quarter);
      res.json(subs);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/quarterly-submissions/generate", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).claims.sub;
      const { taxYear, quarter, jurisdiction } = z.object({
        taxYear: z.number().int().min(2024).max(2030),
        quarter: z.number().int().min(1).max(4),
        jurisdiction: z.string().default("US"),
      }).parse(req.body);

      const { quarterlySubmissions, QUARTERLY_PERIODS, UK_MTD_QUARTERLY_PERIODS } = await import("@shared/schema");

      const periodKey = `${taxYear}-Q${quarter}`;
      const periods = jurisdiction === "UK" ? UK_MTD_QUARTERLY_PERIODS : QUARTERLY_PERIODS;
      const period = periods[periodKey];
      if (!period) return res.status(400).json({ message: `No period data for ${periodKey}` });

      const allIncomes = await storage.getIncomes(userId);
      const allExpenses = await storage.getExpenses(userId);

      const periodIncomes = allIncomes.filter(i => i.date >= period.start && i.date <= period.end);
      const periodExpenses = allExpenses.filter(e => e.date >= period.start && e.date <= period.end);

      const totalIncome = periodIncomes.reduce((sum, i) => sum + Number(i.amount), 0);
      const totalExpenses_ = periodExpenses.reduce((sum, e) => sum + Number(e.amount), 0);
      const netProfit = totalIncome - totalExpenses_;

      const [existing] = await db.select().from(quarterlySubmissions)
        .where(and(
          eq(quarterlySubmissions.userId, userId),
          eq(quarterlySubmissions.taxYear, taxYear),
          eq(quarterlySubmissions.quarter, quarter),
          eq(quarterlySubmissions.jurisdiction, jurisdiction),
        ));

      if (existing) {
        await db.update(quarterlySubmissions)
          .set({
            totalIncome: String(totalIncome.toFixed(2)),
            totalExpenses: String(totalExpenses_.toFixed(2)),
            netProfit: String(netProfit.toFixed(2)),
            status: "ready",
          })
          .where(eq(quarterlySubmissions.id, existing.id));
        const [updated] = await db.select().from(quarterlySubmissions).where(eq(quarterlySubmissions.id, existing.id));
        return res.json(updated);
      }

      const [created] = await db.insert(quarterlySubmissions).values({
        userId,
        taxYear,
        quarter,
        jurisdiction,
        totalIncome: String(totalIncome.toFixed(2)),
        totalExpenses: String(totalExpenses_.toFixed(2)),
        netProfit: String(netProfit.toFixed(2)),
        status: "ready",
      }).returning();

      res.status(201).json(created);
    } catch (error: any) {
      if (error instanceof z.ZodError) return res.status(400).json({ errors: error.errors });
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/quarterly-submissions/:id/submit", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).claims.sub;
      const id = parseInt(req.params.id);
      const { quarterlySubmissions } = await import("@shared/schema");

      const [sub] = await db.select().from(quarterlySubmissions)
        .where(and(eq(quarterlySubmissions.id, id), eq(quarterlySubmissions.userId, userId)));
      if (!sub) return res.status(404).json({ message: "Submission not found" });
      if (sub.status === "submitted") return res.status(400).json({ message: "Already submitted" });

      const referenceId = `MCTUSA-${sub.jurisdiction}-${sub.taxYear}-Q${sub.quarter}-${Date.now().toString(36).toUpperCase()}`;

      await db.update(quarterlySubmissions)
        .set({ status: "submitted", submittedAt: new Date(), referenceId })
        .where(eq(quarterlySubmissions.id, id));

      const [updated] = await db.select().from(quarterlySubmissions).where(eq(quarterlySubmissions.id, id));
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/admin/quarterly-overview", isAuthenticated, async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;
    try {
      const { quarterlySubmissions } = await import("@shared/schema");
      const allSubs = await db.select().from(quarterlySubmissions).orderBy(quarterlySubmissions.taxYear, quarterlySubmissions.quarter);
      const stats = {
        total: allSubs.length,
        pending: allSubs.filter(s => s.status === "pending").length,
        ready: allSubs.filter(s => s.status === "ready").length,
        submitted: allSubs.filter(s => s.status === "submitted").length,
        submissions: allSubs,
      };
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ==================== Final Declaration (5th Return) & Tax Overview ====================

  app.get("/api/tax-overview", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).claims.sub;
      const taxYear = (req.query.taxYear as string) || "2026/27";

      const { finalDeclarations, UK_TAX_BANDS_2026_27 } = await import("@shared/schema");

      const allIncomes = await storage.getIncomes(userId);
      const allExpenses = await storage.getExpenses(userId);

      let periodStart: string, periodEnd: string;
      if (taxYear === "2026/27") {
        periodStart = "2026-04-06";
        periodEnd = "2027-04-05";
      } else {
        periodStart = "2025-04-06";
        periodEnd = "2026-04-05";
      }

      const periodIncomes = allIncomes.filter(i => i.date >= periodStart && i.date <= periodEnd);
      const periodExpenses = allExpenses.filter(e => e.date >= periodStart && e.date <= periodEnd);

      const privateHireIncome = periodIncomes.reduce((sum, i) => sum + Number(i.amount || 0), 0);
      const totalExpenses = periodExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
      const netBusinessProfit = privateHireIncome - totalExpenses;

      const [decl] = await db.select().from(finalDeclarations)
        .where(and(eq(finalDeclarations.userId, userId), eq(finalDeclarations.taxYear, taxYear)));

      const payeIncome = decl ? Number(decl.otherIncomePaye || 0) : 0;
      const dividendIncome = decl ? Number(decl.otherIncomeDividends || 0) : 0;
      const totalGrossIncome = netBusinessProfit + payeIncome + dividendIncome;

      const personalAllowance = totalGrossIncome > 125140 ? 0 :
        totalGrossIncome > 100000 ? Math.max(0, 12570 - Math.floor((totalGrossIncome - 100000) / 2)) : 12570;

      const taxableIncome = Math.max(0, totalGrossIncome - personalAllowance);

      let estimatedTax = 0;
      let remaining = taxableIncome;
      const taxBands = [
        { width: 50270 - 12570, rate: 0.20 },
        { width: 125140 - 50270, rate: 0.40 },
        { width: Infinity, rate: 0.45 },
      ];
      for (const band of taxBands) {
        if (remaining <= 0) break;
        const taxableInBand = Math.min(remaining, band.width);
        estimatedTax += taxableInBand * band.rate;
        remaining -= taxableInBand;
      }
      estimatedTax = Math.round(estimatedTax * 100) / 100;

      const taxAlreadyPaid = payeIncome > 0 ? Math.round(Math.max(0, payeIncome - 12570) * 0.20 * 100) / 100 : 0;
      const balanceDue = Math.max(0, Math.round((estimatedTax - taxAlreadyPaid) * 100) / 100);

      const incomeSources = [
        { label: "Private Hire (MCTUSA)", amount: netBusinessProfit, status: "Synced", icon: "taxi" },
        { label: "Part-time Job (PAYE)", amount: payeIncome, status: payeIncome > 0 ? "Manual Entry" : "Not Added", icon: "briefcase" },
        { label: "Dividends/Savings", amount: dividendIncome, status: dividendIncome > 0 ? "Manual Entry" : "Not Added", icon: "trending-up" },
      ];

      res.json({
        taxYear,
        incomeSources,
        totalGrossIncome: Math.round(totalGrossIncome * 100) / 100,
        totalExpenses: Math.round(totalExpenses * 100) / 100,
        netBusinessProfit: Math.round(netBusinessProfit * 100) / 100,
        personalAllowance,
        taxableIncome: Math.round(taxableIncome * 100) / 100,
        estimatedTax,
        taxAlreadyPaid,
        balanceDue,
        declaration: decl || null,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/tax-overview/other-income", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).claims.sub;
      const { taxYear, payeIncome, dividendIncome } = req.body;
      if (!taxYear) return res.status(400).json({ message: "taxYear required" });

      const { finalDeclarations } = await import("@shared/schema");
      const [existing] = await db.select().from(finalDeclarations)
        .where(and(eq(finalDeclarations.userId, userId), eq(finalDeclarations.taxYear, taxYear)));

      if (existing) {
        await db.update(finalDeclarations)
          .set({
            otherIncomePaye: String(Number(payeIncome || 0)),
            otherIncomeDividends: String(Number(dividendIncome || 0)),
          })
          .where(eq(finalDeclarations.id, existing.id));
      } else {
        await db.insert(finalDeclarations).values({
          userId,
          taxYear,
          status: "unpaid",
          otherIncomePaye: String(Number(payeIncome || 0)),
          otherIncomeDividends: String(Number(dividendIncome || 0)),
        });
      }

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/final-declaration/:taxYear", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).claims.sub;
      const taxYear = req.params.taxYear;
      const { finalDeclarations } = await import("@shared/schema");
      const [decl] = await db.select().from(finalDeclarations)
        .where(and(eq(finalDeclarations.userId, userId), eq(finalDeclarations.taxYear, taxYear)));
      res.json(decl || null);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/final-declaration/checkout", isAuthenticated, async (req: Request, res: Response) => {
    const stripe = await getStripeClient();
    if (!stripe) return res.status(503).json({ message: "Payment processing is not configured yet." });

    try {
      const userId = (req.user as any).claims.sub;
      const { taxYear } = req.body;
      if (!taxYear) return res.status(400).json({ message: "taxYear required" });

      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: "User not found" });

      const { finalDeclarations } = await import("@shared/schema");
      const [existing] = await db.select().from(finalDeclarations)
        .where(and(eq(finalDeclarations.userId, userId), eq(finalDeclarations.taxYear, taxYear)));

      if (existing && existing.status === "paid") {
        return res.status(400).json({ message: "Final Declaration already paid for this tax year." });
      }

      const { getRegionFromCountry } = await import("./geo-detect");
      const userRegion = getRegionFromCountry(user.detectedCountry);

      const isUSUser = userRegion === "US";
      const checkoutCurrency = isUSUser ? "usd" : "gbp";
      const checkoutAmount = isUSUser ? 3500 : 2900;
      const checkoutName = isUSUser
        ? `Annual 1040 Prep — Tax Year ${taxYear}`
        : `Final Declaration — Tax Year ${taxYear}`;
      const checkoutDescription = isUSUser
        ? "Income consolidation, deduction optimization, AI error shield, and IRS submission ID."
        : "Income consolidation, allowance optimisation, AI error shield, and HMRC submission ID.";

      const appUrl = process.env.REPLIT_DEV_DOMAIN
        ? `https://${process.env.REPLIT_DEV_DOMAIN}`
        : process.env.APP_URL || `http://localhost:5000`;

      const sessionConfig: any = {
        mode: "payment",
        line_items: [{
          price_data: {
            currency: checkoutCurrency,
            product_data: {
              name: checkoutName,
              description: checkoutDescription,
            },
            unit_amount: checkoutAmount,
          },
          quantity: 1,
        }],
        success_url: `${appUrl}/tax-overview?taxYear=${encodeURIComponent(taxYear)}&declaration=success`,
        cancel_url: `${appUrl}/tax-overview?taxYear=${encodeURIComponent(taxYear)}&declaration=cancelled`,
        metadata: { userId, taxYear, type: "final_declaration", region: userRegion },
        automatic_tax: { enabled: true },
        tax_id_collection: { enabled: true },
      };

      if (user.stripeCustomerId) {
        sessionConfig.customer = user.stripeCustomerId;
      } else if (user.email) {
        sessionConfig.customer_email = user.email;
      }

      const session = await stripe.checkout.sessions.create(sessionConfig);

      if (!existing) {
        await db.insert(finalDeclarations).values({
          userId,
          taxYear,
          status: "unpaid",
          stripeSessionId: session.id,
        });
      } else {
        await db.update(finalDeclarations)
          .set({ stripeSessionId: session.id })
          .where(eq(finalDeclarations.id, existing.id));
      }

      res.json({ url: session.url });
    } catch (error: any) {
      console.error("[final-declaration] Checkout error:", error);
      res.status(500).json({ message: "Failed to create checkout session." });
    }
  });

  app.post("/api/final-declaration/submit", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).claims.sub;
      const { taxYear } = req.body;
      if (!taxYear) return res.status(400).json({ message: "taxYear required" });

      const { finalDeclarations } = await import("@shared/schema");
      const [decl] = await db.select().from(finalDeclarations)
        .where(and(eq(finalDeclarations.userId, userId), eq(finalDeclarations.taxYear, taxYear)));

      if (!decl) return res.status(404).json({ message: "No declaration found" });
      if (decl.status !== "paid") return res.status(400).json({ message: "Payment required before submission." });
      if (decl.status === "submitted") return res.status(400).json({ message: "Already submitted." });

      const hmrcId = `HMRC-${taxYear.replace("/", "")}-${Date.now().toString(36).toUpperCase()}`;

      const allIncomes = await storage.getIncomes(userId);
      const allExpenses = await storage.getExpenses(userId);
      let periodStart: string, periodEnd: string;
      if (taxYear === "2026/27") {
        periodStart = "2026-04-06"; periodEnd = "2027-04-05";
      } else {
        periodStart = "2025-04-06"; periodEnd = "2026-04-05";
      }
      const periodIncomes = allIncomes.filter(i => i.date >= periodStart && i.date <= periodEnd);
      const periodExpenses = allExpenses.filter(e => e.date >= periodStart && e.date <= periodEnd);
      const privateHireIncome = periodIncomes.reduce((sum, i) => sum + Number(i.amount || 0), 0);
      const totalExpenses = periodExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
      const netBusinessProfit = privateHireIncome - totalExpenses;
      const payeIncome = Number(decl.otherIncomePaye || 0);
      const dividendIncome = Number(decl.otherIncomeDividends || 0);
      const totalGrossIncome = netBusinessProfit + payeIncome + dividendIncome;
      const personalAllowance = totalGrossIncome > 125140 ? 0 :
        totalGrossIncome > 100000 ? Math.max(0, 12570 - Math.floor((totalGrossIncome - 100000) / 2)) : 12570;
      const taxableIncome = Math.max(0, totalGrossIncome - personalAllowance);
      let estimatedTax = 0;
      let remaining = taxableIncome;
      const taxBands = [
        { width: 50270 - 12570, rate: 0.20 },
        { width: 125140 - 50270, rate: 0.40 },
        { width: Infinity, rate: 0.45 },
      ];
      for (const band of taxBands) {
        if (remaining <= 0) break;
        const t = Math.min(remaining, band.width);
        estimatedTax += t * band.rate;
        remaining -= t;
      }
      estimatedTax = Math.round(estimatedTax * 100) / 100;
      const taxAlreadyPaid = payeIncome > 0 ? Math.round(Math.max(0, payeIncome - 12570) * 0.20 * 100) / 100 : 0;
      const balanceDue = Math.max(0, Math.round((estimatedTax - taxAlreadyPaid) * 100) / 100);

      const user = await storage.getUser(userId);
      const driverName = user ? `${user.firstName || ""} ${user.lastName || ""}`.trim() || "Driver" : "Driver";

      await db.update(finalDeclarations).set({
        status: "submitted",
        submittedAt: new Date(),
        hmrcSubmissionId: hmrcId,
        totalGrossIncome: String(Math.round(totalGrossIncome * 100) / 100),
        personalAllowance: String(personalAllowance),
        taxableIncome: String(Math.round(taxableIncome * 100) / 100),
        estimatedTax: String(estimatedTax),
        taxAlreadyPaid: String(taxAlreadyPaid),
        balanceDue: String(balanceDue),
      }).where(eq(finalDeclarations.id, decl.id));

      const [updated] = await db.select().from(finalDeclarations).where(eq(finalDeclarations.id, decl.id));
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/final-declaration/:taxYear/certificate", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).claims.sub;
      const taxYear = req.params.taxYear;
      const { finalDeclarations } = await import("@shared/schema");
      const [decl] = await db.select().from(finalDeclarations)
        .where(and(eq(finalDeclarations.userId, userId), eq(finalDeclarations.taxYear, taxYear)));

      if (!decl || decl.status !== "submitted") {
        return res.status(400).json({ message: "Declaration not yet submitted" });
      }

      const user = await storage.getUser(userId);
      const driverName = user ? `${user.firstName || ""} ${user.lastName || ""}`.trim() || "Driver" : "Driver";

      const { generateTaxCertificatePDF } = await import("./tax-certificate");
      const pdfBuffer = await generateTaxCertificatePDF({
        driverName,
        taxYear,
        hmrcSubmissionId: decl.hmrcSubmissionId || "N/A",
        totalGrossIncome: Number(decl.totalGrossIncome || 0),
        personalAllowance: Number(decl.personalAllowance || 12570),
        taxableIncome: Number(decl.taxableIncome || 0),
        estimatedTax: Number(decl.estimatedTax || 0),
        taxAlreadyPaid: Number(decl.taxAlreadyPaid || 0),
        balanceDue: Number(decl.balanceDue || 0),
        submittedAt: decl.submittedAt || new Date(),
      });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename=MCTUSA_Tax_Certificate_${taxYear.replace("/", "-")}.pdf`);
      res.send(pdfBuffer);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ==================== E-Invoice Vault Email System ====================

  app.get("/api/vault-email", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).claims.sub;
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: "User not found" });
      const slug = userId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 12).toLowerCase();
      const vaultEmail = `${slug}@vault.mctusa.com`;
      res.json({ vaultEmail, userId: slug });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/e-invoices", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).claims.sub;
      const { eInvoices } = await import("@shared/schema");
      const invoices = await db.select().from(eInvoices).where(eq(eInvoices.userId, userId)).orderBy(eInvoices.createdAt);
      res.json(invoices);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/e-invoices/simulate", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).claims.sub;
      const input = z.object({
        senderEmail: z.string().email(),
        senderName: z.string().optional(),
        invoiceNumber: z.string().optional(),
        amount: z.string(),
        currency: z.string().default("USD"),
        description: z.string(),
        category: z.string().optional(),
        invoiceDate: z.string(),
      }).parse(req.body);

      const { eInvoices } = await import("@shared/schema");
      const slug = userId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 12).toLowerCase();
      const vaultEmail = `${slug}@vault.mctusa.com`;

      const [invoice] = await db.insert(eInvoices).values({
        userId,
        vaultEmail,
        senderEmail: input.senderEmail,
        senderName: input.senderName || null,
        invoiceNumber: input.invoiceNumber || null,
        amount: input.amount,
        currency: input.currency,
        description: input.description,
        category: input.category || null,
        invoiceDate: input.invoiceDate,
        status: "received",
        rawPayload: input as any,
      }).returning();

      res.status(201).json(invoice);
    } catch (error: any) {
      if (error instanceof z.ZodError) return res.status(400).json({ errors: error.errors });
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/e-invoices/:id/approve", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).claims.sub;
      const id = parseInt(req.params.id);
      const { eInvoices } = await import("@shared/schema");

      const [inv] = await db.select().from(eInvoices)
        .where(and(eq(eInvoices.id, id), eq(eInvoices.userId, userId)));
      if (!inv) return res.status(404).json({ message: "Invoice not found" });
      if (inv.status === "approved") return res.status(400).json({ message: "Already approved" });

      const expenseDate = inv.invoiceDate || new Date().toISOString().split("T")[0];
      const lockMsg = await checkYearLock(userId, expenseDate);
      if (lockMsg) return res.status(403).json({ message: lockMsg, locked: true });

      const expense = await storage.createExpense({
        userId,
        date: expenseDate,
        amount: inv.amount || "0",
        category: inv.category || "Other Expenses",
        description: `E-Invoice #${inv.invoiceNumber || inv.id}: ${inv.description || ""}`.trim(),
      });

      await db.update(eInvoices)
        .set({ status: "approved", linkedExpenseId: expense.id })
        .where(eq(eInvoices.id, id));

      const [updated] = await db.select().from(eInvoices).where(eq(eInvoices.id, id));
      res.json({ invoice: updated, expense });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/admin/e-invoices-overview", isAuthenticated, async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;
    try {
      const { eInvoices } = await import("@shared/schema");
      const allInvoices = await db.select().from(eInvoices).orderBy(eInvoices.createdAt);
      const stats = {
        total: allInvoices.length,
        pending: allInvoices.filter(i => i.status === "pending").length,
        received: allInvoices.filter(i => i.status === "received").length,
        approved: allInvoices.filter(i => i.status === "approved").length,
        invoices: allInvoices,
      };
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ==================== Admin VIP Management ====================

  app.get("/api/admin/users/search", isAuthenticated, async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;
    try {
      const email = (req.query.email as string || "").trim().toLowerCase();
      if (!email) return res.status(400).json({ message: "Email query required" });

      const { ilike } = await import("drizzle-orm");
      const matches = await db.select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        subscriptionStatus: users.subscriptionStatus,
        isVip: users.isVip,
        vipLabel: users.vipLabel,
        isVerified: users.isVerified,
        userSegment: users.userSegment,
        createdAt: users.createdAt,
      }).from(users).where(ilike(users.email, `%${email}%`)).limit(20);
      res.json(matches);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/admin/users/:userId/vip", isAuthenticated, async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;
    try {
      const targetUserId = req.params.userId;
      const { isVip, vipLabel } = z.object({
        isVip: z.boolean(),
        vipLabel: z.string().optional(),
      }).parse(req.body);

      const user = await storage.getUser(targetUserId);
      if (!user) return res.status(404).json({ message: "User not found" });

      const updates: any = { isVip };
      if (vipLabel !== undefined) updates.vipLabel = vipLabel;
      if (isVip) {
        updates.subscriptionStatus = "pro";
      } else if (!isVip && user.isVip) {
        if (!user.stripeSubscriptionId) {
          updates.subscriptionStatus = "basic";
        }
      }

      await storage.updateUser(targetUserId, updates);
      const updated = await storage.getUser(targetUserId);
      res.json({
        id: updated!.id,
        email: updated!.email,
        firstName: updated!.firstName,
        lastName: updated!.lastName,
        subscriptionStatus: updated!.subscriptionStatus,
        isVip: updated!.isVip,
        vipLabel: updated!.vipLabel,
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) return res.status(400).json({ errors: error.errors });
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/admin/vip-users", isAuthenticated, async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;
    try {
      const vipUsers = await db.select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        vipLabel: users.vipLabel,
        subscriptionStatus: users.subscriptionStatus,
        createdAt: users.createdAt,
      }).from(users).where(eq(users.isVip, true));
      res.json(vipUsers);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ==================== Referral System ====================

  app.get("/api/referrals", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).claims.sub;
      const { referrals } = await import("@shared/schema");
      const userReferrals = await db.select().from(referrals).where(eq(referrals.referrerId, userId)).orderBy(referrals.createdAt);
      res.json(userReferrals);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/referrals/code", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).claims.sub;
      const code = `MCTUSA-${userId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8).toUpperCase()}`;
      res.json({ code });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/referrals/invite", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).claims.sub;
      const { email } = z.object({ email: z.string().email() }).parse(req.body);
      const { referrals } = await import("@shared/schema");

      const now = new Date();
      const year = now.getFullYear();
      const season = `US-${year}`;
      const code = `MCTUSA-${userId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8).toUpperCase()}`;

      const [existing] = await db.select().from(referrals).where(and(
        eq(referrals.referrerId, userId),
        eq(referrals.referredEmail, email),
        eq(referrals.season, season),
      ));
      if (existing) return res.status(400).json({ message: "Already invited this email this season" });

      const [ref] = await db.insert(referrals).values({
        referrerId: userId,
        referredEmail: email,
        referralCode: code,
        status: "pending",
        season,
        creditAwarded: 0,
      }).returning();

      res.status(201).json(ref);
    } catch (error: any) {
      if (error instanceof z.ZodError) return res.status(400).json({ errors: error.errors });
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/referrals/stats", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).claims.sub;
      const { referrals, REFERRAL_TIERS } = await import("@shared/schema");

      const now = new Date();
      const season = `US-${now.getFullYear()}`;

      const userReferrals = await db.select().from(referrals).where(and(
        eq(referrals.referrerId, userId),
        eq(referrals.season, season),
      ));

      const total = userReferrals.length;
      const pending = userReferrals.filter(r => r.status === "pending").length;
      const converted = userReferrals.filter(r => r.status === "converted").length;
      const totalCredits = userReferrals.reduce((sum, r) => sum + (r.creditAwarded || 0), 0);

      let currentTier = null;
      let nextTier = null;
      for (const t of REFERRAL_TIERS) {
        if (converted >= t.minReferrals) currentTier = t;
        else if (!nextTier) nextTier = t;
      }

      const safetyMargin = currentTier ? converted - currentTier.minReferrals : null;

      res.json({
        total,
        pending,
        converted,
        totalCredits,
        season,
        currentTier: currentTier ? { ...currentTier } : null,
        nextTier: nextTier ? { ...nextTier, remaining: nextTier.minReferrals - converted } : null,
        safetyMargin,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/referrals/:id/convert", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).claims.sub;
      const id = parseInt(req.params.id);
      const { referrals } = await import("@shared/schema");
      const { getAdminSetting } = await import("./referral-worker");

      const [ref] = await db.select().from(referrals).where(and(eq(referrals.id, id), eq(referrals.referrerId, userId)));
      if (!ref) return res.status(404).json({ message: "Referral not found" });
      if (ref.status === "converted") return res.status(400).json({ message: "Already converted" });

      const doubleCredit = await getAdminSetting("double_credit_active");
      const creditAmount = doubleCredit === "true" ? 2 : 1;

      await db.update(referrals)
        .set({ status: "converted", creditAwarded: creditAmount, convertedAt: new Date() })
        .where(eq(referrals.id, id));

      const [updated] = await db.select().from(referrals).where(eq(referrals.id, id));
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/referrals/whatsapp-nudge/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).claims.sub;
      const id = parseInt(req.params.id);
      const { referrals } = await import("@shared/schema");

      const [ref] = await db.select().from(referrals).where(and(eq(referrals.id, id), eq(referrals.referrerId, userId)));
      if (!ref) return res.status(404).json({ message: "Referral not found" });

      const user = await storage.getUser(userId);
      const name = user?.firstName || "A friend";
      const message = encodeURIComponent(
        `Hey! ${name} invited you to try My Cab Tax USA — the app that tracks every mile, locks receipts in a 7-year vault, and maximizes your deductions. Use my code ${ref.referralCode} to get started: https://mycabtax.com/signup?ref=${ref.referralCode}`
      );

      res.json({ whatsappUrl: `https://wa.me/?text=${message}`, message: decodeURIComponent(message) });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ==================== Admin Referral Routes ====================

  app.get("/api/admin/referrals", isAuthenticated, async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;
    try {
      const { referrals } = await import("@shared/schema");
      const allReferrals = await db.select().from(referrals).orderBy(referrals.createdAt);

      const vipUsers = await db.select({ id: users.id }).from(users).where(eq(users.isVip, true));
      const vipIds = new Set(vipUsers.map(v => v.id));

      const nonVipReferrals = allReferrals.filter(r => !vipIds.has(r.referrerId));

      const pending = allReferrals.filter(r => r.status === "pending");
      const converted = allReferrals.filter(r => r.status === "converted");

      const referrerStats: Record<string, { total: number; converted: number; credits: number; isVip: boolean }> = {};
      for (const r of allReferrals) {
        if (!referrerStats[r.referrerId]) referrerStats[r.referrerId] = { total: 0, converted: 0, credits: 0, isVip: vipIds.has(r.referrerId) };
        referrerStats[r.referrerId].total++;
        if (r.status === "converted") {
          referrerStats[r.referrerId].converted++;
          referrerStats[r.referrerId].credits += r.creditAwarded || 0;
        }
      }

      res.json({
        total: allReferrals.length,
        pending: pending.length,
        converted: converted.length,
        ghost: pending,
        referrals: allReferrals,
        revenueReferrals: nonVipReferrals.length,
        topReferrers: Object.entries(referrerStats)
          .map(([userId, stats]) => ({ userId, ...stats }))
          .sort((a, b) => b.credits - a.credits)
          .slice(0, 10),
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/admin/referral-settings", isAuthenticated, async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;
    try {
      const { getAdminSetting } = await import("./referral-worker");
      const doubleCreditActive = await getAdminSetting("double_credit_active");
      res.json({
        doubleCreditActive: doubleCreditActive === "true",
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/admin/referral-settings", isAuthenticated, async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;
    try {
      const { doubleCreditActive } = z.object({ doubleCreditActive: z.boolean() }).parse(req.body);
      const { setAdminSetting } = await import("./referral-worker");
      await setAdminSetting("double_credit_active", doubleCreditActive ? "true" : "false");
      res.json({ doubleCreditActive });
    } catch (error: any) {
      if (error instanceof z.ZodError) return res.status(400).json({ errors: error.errors });
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/admin/referral-seasons", isAuthenticated, async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;
    try {
      const { referralSeasons } = await import("@shared/schema");
      const seasons = await db.select().from(referralSeasons).orderBy(referralSeasons.startDate);
      res.json(seasons);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ── Country Rollout Control ──────────────────────────────────────────────────
  const ALL_ROLLOUT_COUNTRIES = ["US","GB","CA","MX","NO","SE","DK","EU","MY","CN","ID","BR","ZA","NG"];

  app.get("/api/admin/country-rollout", isAuthenticated, async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;
    try {
      const { getAdminSetting } = await import("./referral-worker");
      const result: Record<string, boolean> = {};
      for (const code of ALL_ROLLOUT_COUNTRIES) {
        const val = await getAdminSetting(`country_live_${code}`);
        // Default: US and GB are live; others are hidden unless set
        result[code] = val !== null ? val === "true" : (code === "US" || code === "GB");
      }
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/admin/country-rollout/:code", isAuthenticated, async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;
    try {
      const code = req.params.code.toUpperCase();
      if (!ALL_ROLLOUT_COUNTRIES.includes(code)) return res.status(400).json({ message: "Invalid country code" });
      const { live } = req.body;
      if (typeof live !== "boolean") return res.status(400).json({ message: "live must be boolean" });
      const { setAdminSetting } = await import("./referral-worker");
      await setAdminSetting(`country_live_${code}`, live ? "true" : "false");
      await storage.createAuditLog({ userId: (req.user as any).claims.sub, action: `country_rollout_${live ? "enabled" : "disabled"}_${code}` });
      res.json({ code, live });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/country-rollout/preset", isAuthenticated, async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;
    try {
      const { preset } = req.body;
      const { setAdminSetting } = await import("./referral-worker");
      let codes: string[] = [];
      if (preset === "phase1") codes = ["US", "GB"];
      else if (preset === "phase2") codes = ["US", "GB", "CA", "MX", "NO", "SE", "DK"];
      else if (preset === "global") codes = [...ALL_ROLLOUT_COUNTRIES];
      else return res.status(400).json({ message: "Unknown preset" });
      for (const code of ALL_ROLLOUT_COUNTRIES) {
        await setAdminSetting(`country_live_${code}`, codes.includes(code) ? "true" : "false");
      }
      await storage.createAuditLog({ userId: (req.user as any).claims.sub, action: `country_rollout_preset_${preset}` });
      res.json({ preset, enabled: codes });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/admin/users-by-country", isAuthenticated, async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;
    try {
      const rows = await db.select({
        detectedCountry: users.detectedCountry,
      }).from(users);
      const counts: Record<string, number> = { UNKNOWN: 0 };
      for (const row of rows) {
        const c = row.detectedCountry || "UNKNOWN";
        counts[c] = (counts[c] || 0) + 1;
      }
      res.json(counts);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ── Waitlist ─────────────────────────────────────────────────────────────────
  app.post("/api/waitlist", async (req: Request, res: Response) => {
    try {
      const { waitlistSignups, insertWaitlistSignupSchema } = await import("@shared/schema");
      const parsed = insertWaitlistSignupSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ errors: parsed.error.errors });
      const { email, countryCode, countryName, source } = parsed.data;
      // Check for duplicate
      const existing = await db.select().from(waitlistSignups)
        .where(and(eq(waitlistSignups.email, email), eq(waitlistSignups.countryCode, countryCode)));
      if (existing.length > 0) {
        return res.json({ success: true, alreadyRegistered: true });
      }
      await db.insert(waitlistSignups).values({ email, countryCode, countryName, source: source || "global_tax_page" });
      res.json({ success: true, alreadyRegistered: false });
    } catch (error: any) {
      if (error instanceof z.ZodError) return res.status(400).json({ errors: error.errors });
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/admin/waitlist-stats", isAuthenticated, async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;
    try {
      const { waitlistSignups } = await import("@shared/schema");
      const rows = await db.select({
        countryCode: waitlistSignups.countryCode,
        countryName: waitlistSignups.countryName,
      }).from(waitlistSignups);
      const counts: Record<string, { name: string; count: number }> = {};
      for (const row of rows) {
        if (!counts[row.countryCode]) counts[row.countryCode] = { name: row.countryName, count: 0 };
        counts[row.countryCode].count++;
      }
      res.json(counts);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Also expose country rollout status as a public endpoint for the frontend
  app.get("/api/country-rollout", async (req: Request, res: Response) => {
    try {
      const { getAdminSetting } = await import("./referral-worker");
      const result: Record<string, boolean> = {};
      for (const code of ALL_ROLLOUT_COUNTRIES) {
        const val = await getAdminSetting(`country_live_${code}`);
        result[code] = val !== null ? val === "true" : (code === "US" || code === "GB");
      }
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  const statementUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (file.mimetype === "application/pdf" || file.originalname?.endsWith(".pdf")) {
        cb(null, true);
      } else {
        cb(new Error("Only PDF files are allowed"));
      }
    },
  });

  app.post("/api/parse-statement", isAuthenticated, statementUpload.single("statement"), async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const file = req.file;
      if (!file) {
        return res.status(400).json({ message: "No PDF uploaded" });
      }
      const user = await storage.getUser(userId);
      const isPro = user?.subscriptionStatus === "pro" || user?.isVip === true;
      if (!isPro) {
        return res.status(403).json({ message: "Statement Parsing requires a Pro subscription." });
      }

      let pdfText = "";
      try {
        const pdfParse = (await import("pdf-parse")).default;
        const pdfData = await pdfParse(file.buffer);
        pdfText = pdfData.text;
      } catch {
        pdfText = file.buffer.toString("utf-8").replace(/[^\x20-\x7E\n\r\t]/g, " ");
      }

      if (!pdfText || pdfText.trim().length < 20) {
        return res.status(400).json({ message: "Could not extract text from this PDF. It may be image-based." });
      }

      const { ai } = await import("./replit_integrations/image/client");
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-05-20",
        contents: [{
          role: "user",
          parts: [{
            text: `You are an expert earnings statement parser for rideshare and gig economy drivers. Parse the following earnings statement text and extract individual earnings entries.

Return ONLY a valid JSON object (no markdown, no code blocks):
{
  "platform": "string - the platform name (Uber, Lyft, DoorDash, etc.)",
  "periodStart": "string - YYYY-MM-DD or empty",
  "periodEnd": "string - YYYY-MM-DD or empty",
  "entries": [
    {
      "date": "string - YYYY-MM-DD",
      "grossEarnings": number,
      "platformFees": number,
      "tips": number,
      "netPayout": number,
      "description": "string - trip summary or period label"
    }
  ],
  "totals": {
    "grossEarnings": number,
    "platformFees": number,
    "tips": number,
    "netPayout": number
  }
}

Rules:
- Extract every line item that represents an earnings entry
- If only totals/summary are available, create a single entry with those totals
- Dates should be YYYY-MM-DD format
- All amounts should be positive numbers
- Tips should be separated from gross earnings where possible
- Platform fees are commissions/service fees deducted by the platform

Statement text:
${pdfText.substring(0, 15000)}`
          }]
        }]
      });

      const text = response.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const parsed = JSON.parse(cleaned);

      res.json(parsed);
    } catch (err: any) {
      console.error("Statement parse error:", err);
      res.status(500).json({ message: err.message || "Failed to parse statement" });
    }
  });

  app.post("/api/voice-entry", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const { transcript } = req.body;
      if (!transcript || typeof transcript !== "string" || transcript.trim().length < 3) {
        return res.status(400).json({ message: "No transcript provided" });
      }

      const { ai } = await import("./replit_integrations/image/client");
      const today = new Date().toISOString().split("T")[0];
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-05-20",
        contents: [{
          role: "user",
          parts: [{
            text: `You are a bookkeeping assistant for rideshare/cab drivers. Parse the following voice command into a structured financial entry.

Return ONLY a valid JSON object (no markdown):
{
  "type": "income" or "expense",
  "amount": number - the dollar amount mentioned,
  "description": "string - brief description of the transaction",
  "category": "string - for expenses use one of: Car and Truck Expenses, Commissions and Fees, Insurance, Interest, Legal and Professional Services, Office Expense, Other Expenses. For income use the source platform name or 'Tips'",
  "date": "string - YYYY-MM-DD, default to ${today} if no date mentioned",
  "source": "string - for income: Uber, Lyft, DoorDash, Tips, Cash, Other. For expenses: empty string",
  "isTips": boolean - true if this is about tips/gratuities,
  "confidence": number 0-100 - how confident you are in the parsing
}

Rules:
- "spent", "paid", "bought", "cost" indicate an expense
- "earned", "made", "got paid", "received", "tip" indicate income
- If unclear, default to expense
- Extract the dollar amount from natural speech
- "gas", "fuel", "petrol" = Car and Truck Expenses
- "oil change", "repair", "maintenance", "tires" = Car and Truck Expenses
- "insurance" = Insurance
- "phone bill", "phone plan" = Office Expense

Voice command: "${transcript.substring(0, 500)}"`,
          }]
        }]
      });

      const text = response.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const parsed = JSON.parse(cleaned);

      res.json({
        type: parsed.type === "income" ? "income" : "expense",
        amount: Math.abs(Number(parsed.amount) || 0),
        description: String(parsed.description || ""),
        category: String(parsed.category || "Other Expenses"),
        date: String(parsed.date || today),
        source: String(parsed.source || ""),
        isTips: parsed.isTips === true,
        confidence: Math.min(100, Math.max(0, Number(parsed.confidence) || 0)),
      });
    } catch (err: any) {
      console.error("Voice entry parse error:", err);
      res.status(500).json({ message: err.message || "Failed to parse voice command" });
    }
  });

  app.get("/api/spending-anomalies", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const expenses = await storage.getExpenses(userId);

      if (expenses.length < 5) {
        return res.json({ anomalies: [], message: "Not enough data for analysis" });
      }

      const categoryGroups: Record<string, number[]> = {};
      for (const exp of expenses) {
        const cat = exp.category || "Other";
        if (!categoryGroups[cat]) categoryGroups[cat] = [];
        categoryGroups[cat].push(Number(exp.amount));
      }

      const anomalies: Array<{
        id: number;
        date: string;
        amount: number;
        category: string;
        description: string | null;
        average: number;
        stdDev: number;
        zScore: number;
      }> = [];

      for (const [cat, amounts] of Object.entries(categoryGroups)) {
        if (amounts.length < 3) continue;
        const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
        const variance = amounts.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / amounts.length;
        const stdDev = Math.sqrt(variance);
        if (stdDev < 1) continue;

        for (const exp of expenses) {
          if ((exp.category || "Other") !== cat) continue;
          const amt = Number(exp.amount);
          const zScore = (amt - mean) / stdDev;
          if (zScore > 2) {
            anomalies.push({
              id: exp.id,
              date: exp.date,
              amount: amt,
              category: cat,
              description: exp.description,
              average: Math.round(mean * 100) / 100,
              stdDev: Math.round(stdDev * 100) / 100,
              zScore: Math.round(zScore * 100) / 100,
            });
          }
        }
      }

      anomalies.sort((a, b) => b.zScore - a.zScore);
      res.json({ anomalies: anomalies.slice(0, 10) });
    } catch (err: any) {
      console.error("Anomaly detection error:", err);
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/maintenance-predictions", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const vehicles = await storage.getVehicles(userId);
      const mileageLogs = await storage.getMileageLogs(userId);
      const expenses = await storage.getExpenses(userId);

      const maintenanceExpenses = expenses.filter(
        (e) => e.category === "Maintenance" || e.category === "Car and Truck Expenses"
      );

      const predictions = vehicles.map((vehicle) => {
        const vehicleMiles = mileageLogs
          .filter((m) => m.vehicleId === vehicle.id)
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        const vehicleMaint = maintenanceExpenses
          .filter((e) => e.vehicleId === vehicle.id)
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        const totalMiles = vehicleMiles.reduce((sum, m) => sum + Number(m.totalMiles || 0), 0);

        const lastMaintenanceDate = vehicleMaint[0]?.date || null;
        let milesSinceLastService = totalMiles;

        if (lastMaintenanceDate) {
          const lastMaintTime = new Date(lastMaintenanceDate).getTime();
          milesSinceLastService = vehicleMiles
            .filter((m) => new Date(m.date).getTime() > lastMaintTime)
            .reduce((sum, m) => sum + Number(m.totalMiles || 0), 0);
        }

        const maintenanceIntervals: number[] = [];
        for (let i = 1; i < vehicleMaint.length; i++) {
          const days = Math.abs(
            new Date(vehicleMaint[i - 1].date).getTime() - new Date(vehicleMaint[i].date).getTime()
          ) / (1000 * 60 * 60 * 24);
          maintenanceIntervals.push(days);
        }
        const avgIntervalDays = maintenanceIntervals.length > 0
          ? Math.round(maintenanceIntervals.reduce((a, b) => a + b, 0) / maintenanceIntervals.length)
          : 90;

        let predictedNextServiceDate: string | null = null;
        if (lastMaintenanceDate) {
          const nextDate = new Date(lastMaintenanceDate);
          nextDate.setDate(nextDate.getDate() + avgIntervalDays);
          predictedNextServiceDate = nextDate.toISOString().split("T")[0];
        }

        const needsService = milesSinceLastService > 5000;
        const avgMaintenanceCost = vehicleMaint.length > 0
          ? Math.round(vehicleMaint.reduce((sum, e) => sum + Number(e.amount), 0) / vehicleMaint.length * 100) / 100
          : 0;

        return {
          vehicleId: vehicle.id,
          vehicleName: vehicle.name || `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
          totalMiles,
          milesSinceLastService,
          lastMaintenanceDate,
          avgIntervalDays,
          predictedNextServiceDate,
          needsService,
          avgMaintenanceCost,
          maintenanceCount: vehicleMaint.length,
        };
      });

      res.json({ predictions });
    } catch (err: any) {
      console.error("Maintenance prediction error:", err);
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/profitability-heatmap", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const incomes = await storage.getIncomes(userId);

      const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      const dayData: Record<string, { total: number; count: number; tips: number }> = {};
      for (const day of dayNames) {
        dayData[day] = { total: 0, count: 0, tips: 0 };
      }

      for (const income of incomes) {
        const d = new Date(income.date);
        const dayName = dayNames[d.getDay()];
        dayData[dayName].total += Number(income.amount || 0);
        dayData[dayName].count += 1;
        if (income.isTips) {
          dayData[dayName].tips += Number(income.amount || 0);
        }
      }

      const heatmap = dayNames.map((day) => ({
        day,
        totalEarnings: Math.round(dayData[day].total * 100) / 100,
        tripCount: dayData[day].count,
        averagePerTrip: dayData[day].count > 0
          ? Math.round((dayData[day].total / dayData[day].count) * 100) / 100
          : 0,
        tips: Math.round(dayData[day].tips * 100) / 100,
      }));

      const best = heatmap.reduce((a, b) => (a.totalEarnings > b.totalEarnings ? a : b));
      const worst = heatmap.reduce((a, b) => (a.totalEarnings < b.totalEarnings ? a : b));

      let insight = "";
      if (best.totalEarnings > 0 && worst.totalEarnings > 0 && best.day !== worst.day) {
        const pctMore = Math.round(((best.totalEarnings - worst.totalEarnings) / worst.totalEarnings) * 100);
        insight = `Your ${best.day} shifts earn ${pctMore}% more than your ${worst.day} shifts`;
      }

      res.json({ heatmap, bestDay: best.day, worstDay: worst.day, insight });
    } catch (err: any) {
      console.error("Heatmap error:", err);
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/earnings-goal", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const { goal } = req.body;
      if (goal === undefined || goal === null) {
        return res.status(400).json({ message: "Goal amount is required" });
      }
      const goalNum = Number(goal);
      if (isNaN(goalNum) || goalNum < 0) {
        return res.status(400).json({ message: "Goal must be a positive number" });
      }
      await db.update(users).set({ earningsGoal: String(goalNum) }).where(eq(users.id, userId));
      res.json({ success: true, earningsGoal: goalNum });
    } catch (err: any) {
      console.error("Earnings goal error:", err);
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/smart-tax-prediction", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const incomes = await storage.getIncomes(userId);
      const expenses = await storage.getExpenses(userId);
      const mileageLogs = await storage.getMileageLogs(userId);
      const user = await storage.getUser(userId);

      const now = new Date();
      const currentYear = now.getFullYear();
      const dayOfYear = Math.floor((now.getTime() - new Date(currentYear, 0, 1).getTime()) / (1000 * 60 * 60 * 24)) + 1;
      const daysInYear = 365;
      const daysRemaining = daysInYear - dayOfYear;

      const ytdIncome = incomes
        .filter(i => new Date(i.date).getFullYear() === currentYear)
        .reduce((sum, i) => sum + Number(i.amount || 0), 0);
      const ytdTips = incomes
        .filter(i => new Date(i.date).getFullYear() === currentYear && i.isTips)
        .reduce((sum, i) => sum + Number(i.amount || 0), 0);
      const ytdExpenses = expenses
        .filter(e => new Date(e.date).getFullYear() === currentYear)
        .reduce((sum, e) => sum + Number(e.amount || 0), 0);
      const ytdMiles = mileageLogs
        .filter(m => new Date(m.date).getFullYear() === currentYear)
        .reduce((sum, m) => sum + Number(m.totalMiles || 0), 0);

      const topCategories: Record<string, number> = {};
      for (const e of expenses.filter(e => new Date(e.date).getFullYear() === currentYear)) {
        const cat = e.category || "Other";
        topCategories[cat] = (topCategories[cat] || 0) + Number(e.amount || 0);
      }
      const sortedCats = Object.entries(topCategories).sort((a, b) => b[1] - a[1]).slice(0, 5);

      const dataSummary = {
        ytdIncome: Math.round(ytdIncome * 100) / 100,
        ytdTips: Math.round(ytdTips * 100) / 100,
        ytdExpenses: Math.round(ytdExpenses * 100) / 100,
        ytdMiles,
        dayOfYear,
        daysRemaining,
        topExpenseCategories: sortedCats.map(([cat, amt]) => `${cat}: $${(amt as number).toFixed(2)}`),
        selectedState: user?.selectedState || "none",
        detectedCountry: user?.detectedCountry || "US",
      };

      const { ai } = await import("./replit_integrations/image/client");
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-05-20",
        contents: [{
          role: "user",
          parts: [{
            text: `You are a tax advisor AI for self-employed rideshare/cab drivers. Analyze the following year-to-date financial data and predict the year-end tax liability.

Data for ${currentYear} (day ${dayOfYear} of ${daysInYear}):
- YTD Gross Income: $${dataSummary.ytdIncome}
- YTD Tips: $${dataSummary.ytdTips}
- YTD Business Expenses: $${dataSummary.ytdExpenses}
- YTD Business Miles: ${dataSummary.ytdMiles}
- Top Expense Categories: ${dataSummary.topExpenseCategories.join(", ") || "none yet"}
- State: ${dataSummary.selectedState}
- Country: ${dataSummary.detectedCountry}

Use IRS 2026 rules:
- Self-Employment Tax: 15.3% on 92.35% of net profit
- SE Deduction: 50% of SE tax
- Standard Deduction: $15,700
- Federal tax brackets: 10% up to $11,925, 12% up to $48,475, 22% up to $103,350
- Mileage rate: $0.70/mile
- Tips earned in 2025+ may be exempt under the "No Tax on Tips" (OBBBA) provision

Return ONLY valid JSON (no markdown, no code blocks):
{
  "projectedAnnualIncome": number,
  "projectedAnnualExpenses": number,
  "projectedMileageDeduction": number,
  "projectedNetProfit": number,
  "estimatedSETax": number,
  "estimatedFederalTax": number,
  "estimatedStateTax": number,
  "estimatedTotalTax": number,
  "estimatedQuarterlyPayment": number,
  "effectiveTaxRate": number,
  "tips": [array of 2-3 short actionable tax saving tips specific to this driver's data],
  "riskLevel": "low" or "medium" or "high",
  "riskExplanation": "brief explanation of audit risk based on expense ratios",
  "savingsOpportunities": [array of 1-3 potential deductions they might be missing]
}`
          }]
        }]
      });

      const text = response.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const prediction = JSON.parse(cleaned);

      res.json({
        prediction,
        dataSummary,
        generatedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      console.error("Smart tax prediction error:", err);
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/global-tax-assistant", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { question, countryCode, countryContext, userTaxData } = req.body;
      if (!question || !countryCode) return res.status(400).json({ message: "question and countryCode are required" });

      const { ai } = await import("./replit_integrations/image/client");

      const systemPrompt = `You are an expert tax advisor for self-employed rideshare and cab drivers in ${countryCode}. You specialize in ${countryContext}. Provide accurate, practical, and concise answers. Always mention relevant forms, deadlines, and rates where applicable. If user tax data is provided, personalize your advice. Keep responses under 200 words.`;

      const userContext = userTaxData
        ? `\n\nUser's current YTD tax data: Income: ${userTaxData.grossIncome || 0}, Expenses: ${userTaxData.totalExpenses || 0}, Net Profit: ${userTaxData.netProfit || 0}, Mileage: ${userTaxData.mileageDeduction || 0} miles`
        : "";

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-05-20",
        contents: [{ role: "user", parts: [{ text: `${systemPrompt}${userContext}\n\nQuestion: ${question}` }] }],
      });

      const answer = response.candidates?.[0]?.content?.parts?.[0]?.text || "I couldn't generate a response. Please try again.";
      res.json({ answer });
    } catch (error: any) {
      console.error("Global tax assistant error:", error);
      res.status(500).json({ message: "Failed to get AI response", error: error.message });
    }
  });

  return httpServer;
}

// Seed data helper (optional, for demo)
/*
async function seedDemoData(userId: string) {
  const existingExpenses = await storage.getExpenses(userId);
  if (existingExpenses.length === 0) {
    await storage.createExpense({ userId, date: '2023-10-01', amount: 50, category: 'Gas', description: 'Fill up' });
    await storage.createExpense({ userId, date: '2023-10-05', amount: 120, category: 'Maintenance', description: 'Oil change' });
  }
}
*/
