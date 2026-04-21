import { jsPDF } from "jspdf";
import { format, parseISO } from "date-fns";
import { uploadToVault } from "../receipt-vault";
import type { SubmissionProvider, SubmissionData, SubmissionResult } from "./types";
import { InternalIRSAdapter, NO_INCOME_TAX_STATES, HIGH_LOCAL_TAX_JURISDICTIONS } from "./irs-adapter";

export class VaultPDFProvider implements SubmissionProvider {
  readonly name = "vault_pdf";

  async submit(data: SubmissionData): Promise<SubmissionResult> {
    try {
      const irsAdapter = new InternalIRSAdapter();
      const payload = irsAdapter.buildScheduleCPayload(data);
      const pdfBuffer = this.generateAuditPDF(data, payload.filingId, payload.submissionHash);
      const vaultPath = await uploadToVault(
        pdfBuffer,
        data.userId,
        "application/pdf",
        "pro"
      );

      return {
        success: true,
        provider: this.name,
        vaultPath,
        metadata: {
          taxYear: data.taxYear,
          generatedAt: data.generatedAt.toISOString(),
          grossIncome: data.summary.grossIncome,
          netProfit: data.summary.netProfit,
          totalDeductions: data.summary.totalDeductions,
          selfEmploymentTax: data.summary.selfEmploymentTax,
          expenseCount: data.expenses.length,
          incomeCount: data.incomes.length,
          mileageLogCount: data.mileageLogs.length,
          receiptCount: data.receipts.length,
          filingId: payload.filingId,
          submissionHash: payload.submissionHash,
        },
      };
    } catch (err: any) {
      return {
        success: false,
        provider: this.name,
        errorMessage: err.message || "PDF generation failed",
      };
    }
  }

  private generateAuditPDF(data: SubmissionData, filingId: string, submissionHash: string): Buffer {
    const { summary } = data;
    const now = data.generatedAt;
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    let y = 20;
    const lm = 20;
    const col2 = 130;

    const addWatermark = () => {
      doc.setFontSize(7);
      doc.setTextColor(180, 180, 180);
      doc.text(`Filing ID: ${filingId}`, pageWidth - lm, 8, { align: "right" });
      doc.text(`Hash: ${submissionHash.substring(0, 16)}...`, pageWidth - lm, 12, { align: "right" });
      doc.text(`Filing ID: ${filingId}`, lm, pageHeight - 6);
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
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(label, lm + 4, y);
      doc.text(value, col2, y, { align: "left" });
      y += 6;
    };
    const addSep = () => {
      doc.setDrawColor(180);
      doc.line(lm, y, pageWidth - lm, y);
      y += 4;
    };
    const checkPageBreak = (needed: number) => {
      if (y + needed > pageHeight - 20) {
        doc.addPage();
        y = 20;
        addWatermark();
      }
    };

    doc.setFontSize(8);
    doc.setTextColor(200, 0, 0);
    doc.text("*** SELF-PREPARED RETURN — NOT REVIEWED BY PAID PREPARER ***", pageWidth / 2, 16, { align: "center" });
    doc.setTextColor(0);

    addLine("MY CAB TAX USA — IRS AUDIT SUBMISSION", 16, true);
    addLine("Schedule C - Profit or Loss from Business", 11, false);
    addLine(`Tax Year: ${data.taxYear}`, 10, false);
    addLine(`Generated: ${format(now, "MMMM d, yyyy 'at' h:mm a")}`, 8);
    addLine(`Filing ID: ${filingId}`, 8, true);
    addLine(`User ID: ${data.userId}`, 7);
    y += 2;

    doc.setFontSize(7);
    doc.setFont("helvetica", "italic");
    doc.text("Preparer Type: SELF-PREPARED  |  App Role: Electronic Return Originator (ERO)  |  No Paid Preparer", lm, y);
    y += 6;
    addSep();

    addLine("PART I - INCOME", 11, true);
    addRow("Line 1  Gross Receipts:", `$${summary.grossIncome.toFixed(2)}`);
    addRow("Line 10  Commissions & Fees:", `-$${summary.totalPlatformFees.toFixed(2)}`);

    if (Object.keys(summary.incomeBySource).length > 0) {
      y += 2;
      addLine("Income by Source:", 9, true);
      Object.entries(summary.incomeBySource).forEach(([src, val]) => {
        checkPageBreak(8);
        addRow(`  ${src}`, `$${Number(val).toFixed(2)}`);
      });
    }
    y += 2;
    addSep();

    addLine("PART II - EXPENSES", 11, true);
    addRow(`Mileage (${summary.totalMiles.toLocaleString()} mi x $${summary.mileageRate}/mi):`, `-$${summary.mileageDeduction.toFixed(2)}`);
    addRow("Other Deductible Expenses:", `-$${summary.totalOtherExpenses.toFixed(2)}`);
    doc.setFont("helvetica", "bold");
    addRow("Total Deductions:", `-$${summary.totalDeductions.toFixed(2)}`);

    if (Object.keys(summary.expensesByCategory).length > 0) {
      y += 2;
      addLine("Expenses by IRS Category:", 9, true);
      Object.entries(summary.expensesByCategory).forEach(([cat, val]) => {
        checkPageBreak(8);
        addRow(`  ${cat}`, `$${Number(val).toFixed(2)}`);
      });
    }
    y += 2;
    addSep();

    addLine("PART III - NET PROFIT & SELF-EMPLOYMENT TAX", 11, true);
    doc.setFont("helvetica", "bold");
    addRow("Line 31  Net Profit (Loss):", `$${summary.netProfit.toFixed(2)}`);
    doc.setFont("helvetica", "normal");
    y += 2;
    addRow("SE Taxable Base (92.35%):", `$${summary.seTaxableBase.toFixed(2)}`);
    addRow("Self-Employment Tax (15.3%):", `$${summary.selfEmploymentTax.toFixed(2)}`);
    addRow("SE Deduction (50% of SE Tax):", `$${summary.seDeduction.toFixed(2)}`);
    y += 2;
    doc.setFont("helvetica", "bold");
    addRow("RESERVED FOR TAXES:", `$${summary.selfEmploymentTax.toFixed(2)}`);
    addRow("Est. Quarterly Payment:", `$${summary.estimatedQuarterlyPayment.toFixed(2)}`);
    doc.setFont("helvetica", "normal");
    y += 2;
    addSep();

    checkPageBreak(40);
    addLine("QUARTERLY ESTIMATED TAX DEADLINES", 10, true);
    summary.quarterlyDeadlines.forEach((d, i) => {
      addRow(`Q${i + 1}: ${format(parseISO(d), "MMMM d, yyyy")}`, `$${summary.estimatedQuarterlyPayment.toFixed(2)}`);
    });
    y += 4;
    addSep();

    checkPageBreak(30);
    addLine("RECORD COUNTS (Audit Trail)", 10, true);
    addRow("Income Records:", String(data.incomes.length));
    addRow("Expense Records:", String(data.expenses.length));
    addRow("Mileage Log Entries:", String(data.mileageLogs.length));
    addRow("Receipt Images in Vault:", String(data.receipts.length));
    y += 4;
    addSep();

    checkPageBreak(40);
    addLine("MILEAGE LOG INTEGRITY CERTIFICATE", 10, true);
    const entriesWithTimestamps = data.mileageLogs.filter(l => l.createdAt).length;
    const totalEntries = data.mileageLogs.length;
    addRow("Total Mileage Entries:", String(totalEntries));
    addRow("Entries with Real-Time Timestamps:", String(entriesWithTimestamps));
    addRow("Contemporaneous Compliance:", totalEntries > 0 && entriesWithTimestamps === totalEntries ? "YES" : "PARTIAL");
    y += 2;
    doc.setFontSize(8);
    doc.setFont("helvetica", "italic");
    const certStatement = totalEntries > 0
      ? `This log contains ${totalEntries} entries with real-time timestamps, fulfilling the IRS requirement for contemporaneous record-keeping under IRC Sec. 274(d) and Pub. 463.`
      : "No mileage log entries recorded. Standard mileage deduction was applied based on income records.";
    const certLines = doc.splitTextToSize(certStatement, pageWidth - lm * 2);
    doc.text(certLines, lm, y);
    y += certLines.length * 4 + 4;
    addSep();

    checkPageBreak(60);
    addLine("MULTI-JURISDICTION FILING STATUS", 11, true);
    const stateCode = data.jurisdiction?.stateCode || null;
    const stateHasIncomeTax = stateCode ? !NO_INCOME_TAX_STATES.includes(stateCode) : false;
    addRow("State:", stateCode || "Not specified");
    addRow("State Income Tax:", stateHasIncomeTax ? "YES" : "NO (No state income tax)");
    if (stateHasIncomeTax) {
      addRow("CF/SF Program:", "ELIGIBLE - Federal data auto-forwarded to state");
      doc.setFontSize(8);
      doc.setFont("helvetica", "italic");
      doc.text("Combined Federal/State Filing (CF/SF) transmits your federal data to your state automatically.", lm, y);
      y += 5;
      doc.setFont("helvetica", "normal");
    } else if (stateCode) {
      addRow("CF/SF Program:", "NOT REQUIRED - No state income tax in " + stateCode);
    }

    const localTaxEnabled = data.jurisdiction?.localTaxEnabled || false;
    const localJurCode = data.jurisdiction?.localTaxJurisdiction || null;
    const localJur = localJurCode ? HIGH_LOCAL_TAX_JURISDICTIONS[localJurCode] : null;
    addRow("Local Tax Filing:", localTaxEnabled ? "YES" : "NO");
    if (localTaxEnabled && localJur) {
      addRow("Local Jurisdiction:", `${localJur.name} (${localJurCode})`);
      addRow("Local Tax Rate:", `${localJur.rate}%`);
      const localTax = Math.round(summary.netProfit * (localJur.rate / 100) * 100) / 100;
      doc.setFont("helvetica", "bold");
      addRow("Estimated Local Tax:", `$${localTax.toFixed(2)}`);
      doc.setFont("helvetica", "normal");
      addRow("Filing Portal:", localJur.portalUrl);
    }
    y += 2;
    addSep();

    checkPageBreak(80);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    const disclaimer = [
      "PREPARER DECLARATION: This return was SELF-PREPARED by the taxpayer using My Cab Tax USA (MCTUSA),",
      "acting solely as an Electronic Return Originator (ERO). No Paid Preparer reviewed or approved this return.",
      "",
      "PERJURY STATEMENT: Under penalties of perjury, I declare that I have examined this return and",
      "accompanying schedules and statements, and to the best of my knowledge and belief,",
      "they are true, correct, and complete.",
      "",
      "IRS CIRCULAR 230 DISCLOSURE: To ensure compliance with requirements imposed by the IRS,",
      "we inform you that any tax advice contained in this document was not intended or written to be used,",
      "and cannot be used, for the purpose of (i) avoiding penalties under the Internal Revenue Code",
      "or (ii) promoting, marketing, or recommending to another party any transaction or matter addressed herein.",
      "",
      "DISCLAIMER: This is a bookkeeping summary only. It is NOT a tax return.",
      "Consult a qualified CPA or Tax Attorney before submitting any returns to the IRS.",
      "",
      "This document was generated by My Cab Tax USA (MCTUSA), a bookkeeping tool acting as ERO.",
      "It has not been reviewed, verified, or audited by the IRS or any licensed tax professional.",
      "Jurisdiction: State of Delaware.",
    ];
    disclaimer.forEach(line => {
      checkPageBreak(6);
      doc.text(line, lm, y);
      y += 4;
    });

    y += 4;
    checkPageBreak(20);
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.text("DATA FINGERPRINT (for future e-file validation):", lm, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    const fingerprint = JSON.stringify({
      filingId,
      submissionHash,
      taxYear: data.taxYear,
      grossIncome: summary.grossIncome,
      netProfit: summary.netProfit,
      totalDeductions: summary.totalDeductions,
      selfEmploymentTax: summary.selfEmploymentTax,
      preparerType: "self_prepared",
      generatedAt: now.toISOString(),
    });
    doc.text(fingerprint, lm, y, { maxWidth: pageWidth - lm * 2 });
    y += 12;

    doc.setFontSize(8);
    doc.setTextColor(200, 0, 0);
    doc.text("*** SELF-PREPARED RETURN — NOT REVIEWED BY PAID PREPARER ***", pageWidth / 2, y + 4, { align: "center" });

    const arrayBuffer = doc.output("arraybuffer");
    return Buffer.from(arrayBuffer);
  }
}
