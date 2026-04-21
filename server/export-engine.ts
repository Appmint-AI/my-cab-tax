import { storage } from "./storage";
import { IRS_MILEAGE_RATE, mapToIRSCategory, SALT_DEDUCTION_CAP } from "@shared/schema";
import { getReceiptBuffer } from "./receipt-vault";
import archiver from "archiver";
import { Writable } from "stream";

const AUDIT_RISK_MAP: Record<string, string> = {
  "Car and Truck Expenses": "Low",
  "Commissions and Fees": "Low",
  "Insurance": "Low",
  "Interest": "Low",
  "Legal and Professional Services": "Low",
  "Office Expense": "Medium",
  "Home Office": "Medium",
  "Property Tax (SALT)": "Medium",
  "Other Expenses": "High",
};

export interface CategoryBreakdown {
  category: string;
  totalSpent: number;
  deductibleAmount: number;
  auditRisk: string;
}

export interface ExportSummary {
  taxYear: number;
  grossIncome: number;
  tipIncome: number;
  totalExpenses: number;
  totalDeductions: number;
  totalMiles: number;
  mileageDeduction: number;
  saltTotal: number;
  saltCapped: number;
  categoryBreakdown: CategoryBreakdown[];
  netProfit: number;
  receiptCount: number;
}

export async function buildExportSummary(userId: string, taxYear: number): Promise<ExportSummary> {
  const [expenses, incomes, mileageLogs, receipts] = await Promise.all([
    storage.getExpenses(userId),
    storage.getIncomes(userId),
    storage.getMileageLogs(userId),
    storage.getReceipts(userId),
  ]);

  const yearExpenses = expenses.filter(e => new Date(e.date).getFullYear() === taxYear);
  const yearIncomes = incomes.filter(i => new Date(i.date).getFullYear() === taxYear);
  const yearMileage = mileageLogs.filter(m => new Date(m.date).getFullYear() === taxYear);
  const yearReceipts = receipts.filter(r => {
    const d = r.receiptDate ? new Date(r.receiptDate) : r.createdAt ? new Date(r.createdAt) : null;
    return d && d.getFullYear() === taxYear;
  });

  const grossIncome = yearIncomes.reduce((sum, i) => sum + Number(i.amount), 0);
  const tipIncome = yearIncomes.filter(i => i.isTips).reduce((sum, i) => sum + Number(i.amount), 0);
  const totalMiles = yearMileage.reduce((sum, m) => sum + Number(m.totalMiles), 0);
  const mileageDeduction = totalMiles * IRS_MILEAGE_RATE;

  const categoryTotals: Record<string, number> = {};
  yearExpenses.forEach(e => {
    const irsCategory = mapToIRSCategory(e.category);
    categoryTotals[irsCategory] = (categoryTotals[irsCategory] || 0) + Number(e.amount);
  });

  const saltTotal = categoryTotals["Property Tax (SALT)"] || 0;
  const saltCapped = Math.min(saltTotal, SALT_DEDUCTION_CAP);
  const saltExcess = saltTotal - saltCapped;

  const categoryBreakdown: CategoryBreakdown[] = Object.entries(categoryTotals).map(([category, totalSpent]) => {
    let deductibleAmount = totalSpent;
    if (category === "Property Tax (SALT)") {
      deductibleAmount = Math.min(totalSpent, SALT_DEDUCTION_CAP);
    }
    return {
      category,
      totalSpent,
      deductibleAmount,
      auditRisk: AUDIT_RISK_MAP[category] || "High",
    };
  });

  const totalExpenses = yearExpenses.reduce((sum, e) => sum + Number(e.amount), 0);
  const totalDeductions = categoryBreakdown.reduce((sum, c) => sum + c.deductibleAmount, 0);

  const netProfit = grossIncome - tipIncome - totalDeductions - mileageDeduction;

  return {
    taxYear,
    grossIncome,
    tipIncome,
    totalExpenses,
    totalDeductions,
    totalMiles,
    mileageDeduction,
    saltTotal,
    saltCapped,
    categoryBreakdown,
    netProfit,
    receiptCount: yearReceipts.length,
  };
}

export function generateExpensesCsv(expenses: any[], taxYear: number): string {
  const yearExpenses = expenses.filter(e => new Date(e.date).getFullYear() === taxYear);
  const headers = ["Date", "Category", "IRS Category", "Description", "Amount", "Receipt"];
  const rows = yearExpenses.map(e => [
    e.date,
    e.category,
    mapToIRSCategory(e.category),
    e.description || "",
    Number(e.amount).toFixed(2),
    e.receiptUrl ? "Yes" : "No",
  ]);
  const total = yearExpenses.reduce((s, e) => s + Number(e.amount), 0);
  rows.push(["TOTAL", "", "", "", total.toFixed(2), ""]);
  return [headers.join(","), ...rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(","))].join("\n");
}

export function generateMileageCsv(logs: any[], taxYear: number): string {
  const yearLogs = logs.filter(m => new Date(m.date).getFullYear() === taxYear);
  const headers = ["Date", "Business Purpose", "Start Odometer", "End Odometer", "Total Miles", "State", "Deduction"];
  const rows = yearLogs.map(m => [
    m.date,
    m.businessPurpose,
    m.startOdometer || "",
    m.endOdometer || "",
    Number(m.totalMiles).toFixed(1),
    m.tripState || "",
    (Number(m.totalMiles) * IRS_MILEAGE_RATE).toFixed(2),
  ]);
  const totalMiles = yearLogs.reduce((s, m) => s + Number(m.totalMiles), 0);
  rows.push(["TOTAL", "", "", "", totalMiles.toFixed(1), "", (totalMiles * IRS_MILEAGE_RATE).toFixed(2)]);
  return [headers.join(","), ...rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(","))].join("\n");
}

export function generateIncomeCsv(incomes: any[], taxYear: number): string {
  const yearIncomes = incomes.filter(i => new Date(i.date).getFullYear() === taxYear);
  const headers = ["Date", "Source", "Description", "Amount", "Platform Fees", "Tips", "State"];
  const rows = yearIncomes.map(i => [
    i.date,
    i.source,
    i.description || "",
    Number(i.amount).toFixed(2),
    Number(i.platformFees || 0).toFixed(2),
    i.isTips ? "Yes" : "No",
    i.payeeState || "",
  ]);
  const total = yearIncomes.reduce((s, i) => s + Number(i.amount), 0);
  rows.push(["TOTAL", "", "", total.toFixed(2), "", "", ""]);
  return [headers.join(","), ...rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(","))].join("\n");
}

export async function createReceiptVaultZip(userId: string, taxYear: number): Promise<Buffer> {
  const receipts = await storage.getReceipts(userId);
  const yearReceipts = receipts.filter(r => {
    const d = r.receiptDate ? new Date(r.receiptDate) : r.createdAt ? new Date(r.createdAt) : null;
    return d && d.getFullYear() === taxYear;
  });

  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const writable = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(chunk);
        callback();
      },
    });

    const archive = archiver("zip", { zlib: { level: 6 } });
    archive.pipe(writable);

    writable.on("finish", () => resolve(Buffer.concat(chunks)));
    archive.on("error", reject);

    const processReceipts = async () => {
      for (const receipt of yearReceipts) {
        if (!receipt.imageUrl) continue;
        try {
          const buffer = await getReceiptBuffer(receipt.imageUrl);
          const d = receipt.receiptDate ? new Date(receipt.receiptDate) : receipt.createdAt ? new Date(receipt.createdAt) : new Date();
          const month = String(d.getMonth() + 1).padStart(2, "0");
          const monthName = d.toLocaleString("en-US", { month: "long" });
          const folder = `${month}-${monthName}`;
          const filename = receipt.merchantName
            ? `${receipt.merchantName.replace(/[^a-zA-Z0-9]/g, "_")}_${receipt.id}.jpg`
            : `receipt_${receipt.id}.jpg`;
          archive.append(buffer, { name: `Receipt-Vault-${taxYear}/${folder}/${filename}` });
        } catch {
          // Skip receipts that can't be fetched
        }
      }
      archive.finalize();
    };

    processReceipts().catch(reject);
  });
}
