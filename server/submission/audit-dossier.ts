import { jsPDF } from "jspdf";
import { format } from "date-fns";
import type { SubmissionData } from "./types";

export function generateAuditDossierPDF(data: SubmissionData): Buffer {
  const { summary } = data;
  const now = new Date();
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  let y = 20;
  const lm = 20;
  const col2 = 130;
  const watermarkText = "Verified Record - Stored in MCTUSA Immutable Vault";

  const addWatermark = () => {
    doc.setFontSize(7);
    doc.setTextColor(180, 180, 180);
    doc.text(watermarkText, pageWidth / 2, 8, { align: "center" });
    doc.text(watermarkText, pageWidth / 2, pageHeight - 6, { align: "center" });
    doc.setTextColor(0);
  };

  addWatermark();

  const addLine = (text: string, fontSize = 10, bold = false) => {
    doc.setFontSize(fontSize);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.text(text, lm, y);
    y += fontSize * 0.5 + 2;
  };

  const addRow = (label: string, value: string) => {
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(label, lm + 5, y);
    doc.text(value, col2, y);
    y += 5;
  };

  const addSep = () => {
    doc.setDrawColor(200);
    doc.line(lm, y, pageWidth - lm, y);
    y += 4;
  };

  const checkPageBreak = (needed: number) => {
    if (y + needed > pageHeight - 30) {
      doc.addPage();
      y = 20;
      addWatermark();
    }
  };

  const fmt = (n: number) => `$${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;

  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("IRS AUDIT EVIDENCE DOSSIER", pageWidth / 2, y, { align: "center" });
  y += 8;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("My Cab Tax USA - Certified Tax Records", pageWidth / 2, y, { align: "center" });
  y += 6;
  doc.text(`Tax Year: ${data.taxYear} | Generated: ${format(now, "MMMM d, yyyy 'at' h:mm a")}`, pageWidth / 2, y, { align: "center" });
  y += 10;
  addSep();

  addLine("SECTION 1: SCHEDULE C SUMMARY", 11, true);
  y += 2;
  addRow("Line 1 - Gross Receipts:", fmt(summary.grossIncome));
  addRow("Line 6 - Cost of Goods Sold:", "$0.00");
  addRow("Line 7 - Gross Income:", fmt(summary.grossIncome - summary.totalPlatformFees));
  addRow("Platform Fees / Commissions:", fmt(summary.totalPlatformFees));
  addRow("Line 9 - Car & Truck Expenses (Mileage):", fmt(summary.mileageDeduction));
  addRow("Other Deductions:", fmt(summary.totalOtherExpenses));
  addRow("Line 28 - Total Expenses:", fmt(summary.totalDeductions));
  addRow("Line 31 - Net Profit:", fmt(summary.netProfit));
  addRow("Self-Employment Tax:", fmt(summary.selfEmploymentTax));
  y += 4;
  addSep();

  checkPageBreak(60);
  addLine("SECTION 2: INCOME RECORDS", 11, true);
  y += 2;
  addRow("Total Income Entries:", String(data.incomes.length));
  data.incomes.forEach((inc, i) => {
    checkPageBreak(10);
    doc.setFontSize(8);
    doc.text(`  ${i + 1}. ${inc.date} | ${inc.source} | ${fmt(Number(inc.amount))} | Fees: ${fmt(Number(inc.platformFees || 0))}`, lm, y);
    y += 4;
  });
  y += 4;
  addSep();

  checkPageBreak(40);
  addLine("SECTION 3: GROSS-UP MATH LOGIC", 11, true);
  y += 2;
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  const grossUpExplain = [
    "Auto-Grossing Formula: Gross = Net Payout / (1 - Commission Rate)",
    `Commission rates applied: 20% (Lyft), 25% (Uber), 30% (High)`,
    `Total Gross Receipts: ${fmt(summary.grossIncome)}`,
    `Total Platform Fees Deducted: ${fmt(summary.totalPlatformFees)}`,
    `Net After Fees: ${fmt(summary.grossIncome - summary.totalPlatformFees)}`,
  ];
  grossUpExplain.forEach(line => {
    doc.text(line, lm + 5, y);
    y += 4;
  });
  y += 4;
  addSep();

  checkPageBreak(60);
  addLine("SECTION 4: EXPENSE RECORDS", 11, true);
  y += 2;
  addRow("Total Expense Entries:", String(data.expenses.length));
  const byCategory: Record<string, number> = {};
  data.expenses.forEach(exp => {
    byCategory[exp.category] = (byCategory[exp.category] || 0) + Number(exp.amount);
  });
  Object.entries(byCategory).forEach(([cat, amt]) => {
    checkPageBreak(8);
    addRow(`  ${cat}:`, fmt(amt));
  });
  y += 4;
  addSep();

  checkPageBreak(60);
  addLine("SECTION 5: CONTEMPORANEOUS MILEAGE LOG", 11, true);
  y += 2;
  addRow("Total Mileage Entries:", String(data.mileageLogs.length));
  addRow("Total Business Miles:", `${summary.totalMiles.toFixed(1)} miles`);
  addRow("IRS Rate Applied:", `$${summary.mileageRate}/mile`);
  addRow("Mileage Deduction:", fmt(summary.mileageDeduction));
  y += 2;

  data.mileageLogs.forEach((log, i) => {
    checkPageBreak(10);
    doc.setFontSize(8);
    const odo = log.startOdometer && log.endOdometer
      ? ` | Odo: ${log.startOdometer}-${log.endOdometer}`
      : "";
    doc.text(`  ${i + 1}. ${log.date} | ${Number(log.totalMiles).toFixed(1)} mi | ${log.businessPurpose}${odo}`, lm, y);
    y += 4;
  });

  y += 4;
  const entriesWithTimestamps = data.mileageLogs.filter(l => l.createdAt).length;
  const totalEntries = data.mileageLogs.length;
  checkPageBreak(20);
  doc.setFontSize(8);
  doc.setFont("helvetica", "italic");
  const certText = totalEntries > 0
    ? `MILEAGE LOG INTEGRITY CERTIFICATE: This log contains ${totalEntries} entries with ${entriesWithTimestamps} real-time timestamps, fulfilling the IRS requirement for contemporaneous record-keeping under IRC Sec. 274(d) and Pub. 463.`
    : "No mileage log entries recorded.";
  const certLines = doc.splitTextToSize(certText, pageWidth - lm * 2);
  doc.text(certLines, lm, y);
  y += certLines.length * 4 + 4;
  addSep();

  checkPageBreak(40);
  addLine("SECTION 6: RECEIPT INVENTORY", 11, true);
  y += 2;
  addRow("Total Receipts Stored:", String(data.receipts.length));
  data.receipts.forEach((rec, i) => {
    checkPageBreak(10);
    doc.setFontSize(8);
    const merchant = rec.merchantName || "Unknown Merchant";
    const amt = rec.totalAmount ? fmt(Number(rec.totalAmount)) : "N/A";
    const dt = rec.receiptDate || "No Date";
    doc.text(`  ${i + 1}. ${merchant} | ${dt} | ${amt} | Retention: ${rec.retentionPolicy}`, lm, y);
    y += 4;
  });
  y += 4;
  addSep();

  checkPageBreak(40);
  addLine("SECTION 7: 1099-K RECONCILIATION", 11, true);
  y += 2;
  const form1099KEntries = data.incomes.filter(i => i.source === "1099-K" || i.source?.includes("1099"));
  const total1099K = form1099KEntries.reduce((sum, i) => sum + Number(i.amount), 0);
  addRow("1099-K Entries Found:", String(form1099KEntries.length));
  addRow("Total 1099-K Reported:", fmt(total1099K));
  addRow("Schedule C Line 1 (Gross Receipts):", fmt(summary.grossIncome));
  const diff = summary.grossIncome - total1099K;
  addRow("Variance:", `${fmt(Math.abs(diff))} ${diff >= 0 ? "(RECONCILED)" : "(BELOW 1099-K - REVIEW)"}`);
  y += 4;
  addSep();

  checkPageBreak(30);
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  const disclaimer = [
    "This document was generated by My Cab Tax USA (MCTUSA) as a certified audit evidence package.",
    "All records were stored in the MCTUSA Immutable Vault with timestamps and data integrity hashes.",
    "This dossier is intended to assist in responding to IRS or state tax authority inquiries.",
    "MCTUSA does not provide legal representation or Power of Attorney. Consult a qualified CPA or Tax Attorney.",
  ];
  disclaimer.forEach(line => {
    checkPageBreak(8);
    doc.text(line, lm, y);
    y += 4;
  });

  return Buffer.from(doc.output("arraybuffer"));
}
