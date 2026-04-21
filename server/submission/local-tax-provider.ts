import { jsPDF } from "jspdf";
import { format } from "date-fns";
import type { SubmissionProvider, SubmissionData, SubmissionResult } from "./types";
import { InternalIRSAdapter, HIGH_LOCAL_TAX_JURISDICTIONS } from "./irs-adapter";

export class LocalTaxProvider implements SubmissionProvider {
  readonly name = "local_tax_eit";

  async submit(data: SubmissionData): Promise<SubmissionResult> {
    try {
      if (!data.jurisdiction?.localTaxEnabled || !data.jurisdiction.localTaxJurisdiction) {
        return {
          success: false,
          provider: this.name,
          errorMessage: "Local tax filing is not enabled or no jurisdiction is configured.",
        };
      }

      const jurisdictionCode = data.jurisdiction.localTaxJurisdiction;
      const jurisdiction = HIGH_LOCAL_TAX_JURISDICTIONS[jurisdictionCode];

      if (!jurisdiction) {
        return {
          success: false,
          provider: this.name,
          errorMessage: `Unknown local tax jurisdiction: ${jurisdictionCode}`,
        };
      }

      const irsAdapter = new InternalIRSAdapter();
      const payload = irsAdapter.buildScheduleCPayload(data);

      const pdfBuffer = this.generateLocalEITPDF(data, payload.filingId, jurisdiction, jurisdictionCode);

      return {
        success: true,
        provider: this.name,
        metadata: {
          jurisdictionCode,
          jurisdictionName: jurisdiction.name,
          localTaxRate: jurisdiction.rate,
          estimatedLocalTax: payload.jurisdiction.localTaxEstimate,
          netProfit: data.summary.netProfit,
          portalUrl: jurisdiction.portalUrl,
          filingId: payload.filingId,
          taxYear: data.taxYear,
        },
      };
    } catch (err: any) {
      return {
        success: false,
        provider: this.name,
        errorMessage: err.message || "Local tax PDF generation failed",
      };
    }
  }

  generateLocalEITPDF(
    data: SubmissionData,
    filingId: string,
    jurisdiction: { name: string; rate: number; portalUrl: string },
    jurisdictionCode: string
  ): Buffer {
    const { summary } = data;
    const now = data.generatedAt;
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    let y = 20;
    const lm = 20;
    const col2 = 130;

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

    doc.setFontSize(7);
    doc.setTextColor(180, 180, 180);
    doc.text(`Filing ID: ${filingId}`, pageWidth - lm, 8, { align: "right" });
    doc.text(`Local Tax Statement - ${jurisdictionCode}`, pageWidth - lm, 12, { align: "right" });
    doc.setTextColor(0);

    addLine("MY CAB TAX USA - LOCAL EARNED INCOME TAX STATEMENT", 14, true);
    addLine(`Jurisdiction: ${jurisdiction.name}`, 11, false);
    addLine(`Tax Year: ${data.taxYear}`, 10, false);
    addLine(`Generated: ${format(now, "MMMM d, yyyy 'at' h:mm a")}`, 8);
    addLine(`Filing ID: ${filingId}`, 8, true);
    y += 4;
    addSep();

    addLine("TAXPAYER INFORMATION", 11, true);
    addRow("User ID:", data.userId);
    addRow("Filing Jurisdiction:", `${jurisdiction.name} (${jurisdictionCode})`);
    addRow("Local Tax Rate:", `${jurisdiction.rate}%`);
    y += 2;
    addSep();

    addLine("INCOME SUMMARY (from Schedule C)", 11, true);
    addRow("Gross Receipts (Line 1):", `$${summary.grossIncome.toFixed(2)}`);
    addRow("Total Deductions (Line 28):", `-$${summary.totalDeductions.toFixed(2)}`);
    doc.setFont("helvetica", "bold");
    addRow("Net Profit (Line 31):", `$${summary.netProfit.toFixed(2)}`);
    doc.setFont("helvetica", "normal");
    y += 2;
    addSep();

    addLine("LOCAL TAX CALCULATION", 11, true);
    const localTax = Math.round(summary.netProfit * (jurisdiction.rate / 100) * 100) / 100;
    addRow("Taxable Income (Net Profit):", `$${summary.netProfit.toFixed(2)}`);
    addRow(`Local Tax Rate:`, `${jurisdiction.rate}%`);
    doc.setFont("helvetica", "bold");
    addRow("Estimated Local Tax Due:", `$${localTax.toFixed(2)}`);
    doc.setFont("helvetica", "normal");
    y += 4;
    addSep();

    if (summary.totalMiles > 0) {
      addLine("MILEAGE DEDUCTION APPLIED", 10, true);
      addRow("Total Business Miles:", `${summary.totalMiles.toLocaleString()} mi`);
      addRow("Mileage Deduction:", `-$${summary.mileageDeduction.toFixed(2)}`);
      y += 2;
      addSep();
    }

    addLine("FILING INSTRUCTIONS", 11, true);
    y += 2;
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    const instructions = [
      `1. Visit the ${jurisdiction.name} tax portal:`,
      `   ${jurisdiction.portalUrl}`,
      "",
      "2. Log in or create an account with your local tax authority.",
      "",
      "3. Select 'Self-Employment / Schedule C Income' as the income type.",
      "",
      `4. Enter Net Profit of $${summary.netProfit.toFixed(2)} as your taxable earned income.`,
      "",
      `5. The estimated local tax due is $${localTax.toFixed(2)}.`,
      "",
      "6. Upload this PDF as supporting documentation if the portal allows it.",
      "",
      "7. Retain a copy of your filing confirmation for your records.",
    ];
    instructions.forEach(line => {
      doc.text(line, lm, y);
      y += 5;
    });

    y += 4;
    addSep();

    doc.setFontSize(7);
    doc.setFont("helvetica", "italic");
    const disclaimer = [
      "DISCLAIMER: This is a summary document generated by My Cab Tax USA (MCTUSA).",
      "It is NOT a completed local tax return. Local filing requirements vary by jurisdiction.",
      "Consult your local tax authority or a qualified tax professional for exact filing obligations.",
      "MCTUSA acts solely as an Electronic Return Originator (ERO) and bookkeeping tool.",
      "",
      `As of 2026, ${jurisdiction.name} may require electronic filing. Paper returns may not be accepted.`,
      "Check your jurisdiction's requirements before filing.",
    ];
    disclaimer.forEach(line => {
      doc.text(line, lm, y);
      y += 4;
    });

    const arrayBuffer = doc.output("arraybuffer");
    return Buffer.from(arrayBuffer);
  }
}
