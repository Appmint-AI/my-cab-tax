# My Cab Tax USA

## Overview
My Cab Tax USA is a tax tracking application for rideshare and cab drivers in the US. It simplifies tax preparation by tracking income, expenses, and mileage to calculate Schedule C profit, maximize deductions, ensure compliance, and streamline the tax filing process. The project aims to provide a comprehensive tax management solution for gig economy workers, with future expansion into multi-jurisdiction and global capabilities.

## User Preferences
- Auth0 with MFA/biometric security preferred over Replit Auth
- Google Cloud Run for production deployment (scalability)

## System Architecture
The application uses a React, Vite, TailwindCSS, shadcn/ui, and Recharts frontend, with an Express.js, Drizzle ORM, and PostgreSQL backend. Auth0 handles authentication, and TanStack Query manages data fetching.

**Key Architectural and Feature Specifications:**

-   **UI/UX**: Features a dedicated `/export` page, multi-step onboarding, a dynamic dashboard, "Submission Readiness Checklist," "Smart Summary / Money Saved," and i18next with RTL support and language switcher.
-   **Receipt Management**: Uses Google Cloud Storage for receipts with AI-powered multimodal OCR (Gemini AI) for data extraction, auto-filling expense forms, and user-scoped retention policies.
-   **Vehicle & Mileage Tracking**: Supports CRUD for multiple vehicles and IRS-compliant mileage tracking.
-   **Tax Ready Export Engine**: Generates accountant-friendly verification tables, per-year tax summaries, individual CSV downloads, and a Receipt Vault ZIP download (Pro only).
-   **Identity & Verification**: Multi-step onboarding for identity verification with Driver's License OCR.
-   **Subscription & Pro Features**: Integrated with Stripe for tiered pricing (Basic/Pro), offering extended receipt retention, AI scanning, auto-grossing, and smart sales importing.
-   **Submission Module**: Modular system for generating validated IRS Audit PDFs and a placeholder for e-filing, including a DATA FINGERPRINT JSON block and `submissionHash`.
-   **Pre-Submission Validation**: Checks for common IRS errors with blocking errors or advisory warnings.
-   **Tax Year Lock & Finalization**: Locks a tax year after "Finalize Submission," with a "Perjury Gate" and e-signature. All finalization actions are logged.
-   **Submission Receipts & Audit Trail**: Captures signed submission snapshots in an immutable `submission_receipts` table.
-   **Compliance Features**: IRS integrity checks, mileage log integrity certificates, extensive audit logging, and an "Audit Defense Center" (Pro).
-   **Multi-Jurisdiction Tax Filing**: Supports multi-state tax filing via a `UniversalStateEngine` and `Jurisdiction Rules Engine` for state-specific calculations.
-   **Industry Segment System**: Supports Taxi/Rideshare, Delivery Courier, and Hybrid drivers with segment-aware UI and suggestions.
-   **Tax Profile Onboarding**: Expanded onboarding includes primary location, local tax context, and residency status.
-   **Compliance & Tax Rate Management**: Pluggable `Live Tax Rate Provider` (Stripe Tax/Avalara) and `Compliance Sentinel` for monitoring IRS RSS feeds.
-   **Lifecycle Email Automation**: `LifecycleManager` sends segment-aware emails at key user milestones via Resend.
-   **2026 Tax Law Updates**: Incorporates "No Tax on Tips (OBBBA)," 1099-K Threshold Reversion, updated 2026 Mileage Rate, increased SALT Deduction Cap, and a Quarterly Estimated Tax Calculator.
-   **Exit-Readiness Package**: Includes `PLAN.md`, `HANDOVER.md`, `LICENSES.md`, `CREDENTIALS_MAP.md`, a `Tax Engine Test Suite`, JSDoc, and an Admin Dashboard.
-   **AI Command Center (Admin)**: Gemini-powered Executive Assistant chatbot on the `/admin` page.
-   **Tax Season Countdown Emails**: Automated, segment-aware emails before tax deadlines.
-   **Global Platform Features**: GPS Geofencing, OCR Receipt Scanning (Pro), DAC7 CSV Comparison Tool, and DHIP Currency Engine for real-time exchange rates.
-   **Global Elite Features**:
    -   **Currency Anchor**: Background task to convert unanchored expense/income to Stable USD.
    -   **Multi-Gig Bridge**: `/sync` page for uploading earnings CSVs from various platforms, with smart column detection and import-to-income capability.
    -   **Simplified View**: Toggle for icon-only sidebar mode.
    -   **Audit Sentinel**: Risk analysis engine comparing user expenses against regional averages.
-   **Global Security Manifesto Features**: Auto USD anchoring on save for inflation protection, Penalty Protection Countdown for IRS deadlines, Wealth Forecast/Retirement Calculator, and Auth0 multi-language support.
-   **Internationalization (i18n)**: i18next with browser language detection, localStorage persistence, and RTL support for Arabic and Urdu, across 4 languages (English, Urdu, Arabic, Vietnamese).
-   **DAC7 CSV Comparison Tool**: `/dac7` page for uploading platform CSVs, matching against expense logs, and adding missing records.
-   **Next-Gen 2026 Compliance Features**:
    -   **MTD Quarterly Submissions**: User-facing `/quarterly` page for generating and submitting quarterly tax summaries (IRS 1040-ES, HMRC MTD).
    -   **E-Invoice Bridge**: Structured e-invoicing system with unique vault emails for direct vendor invoice reception and approval.
-   **Driver-Support Referral System**: Ghost tracking for invited users, Double-Credit Toggle, Safety Net Worker for tier alerts, and Annual Reset for referral seasons.
-   **VIP Override System**: `is_vip` and `vip_label` fields for automatic Pro access, billing bypass, profile badge, and Admin Dashboard management.
-   **Final Declaration (5th Return)**: One-time £29 Stripe payment to unlock year-end tax filing with sales pitch card and various states.
-   **Tax Overview (2026/27 Edition)**: Live tax summary page at `/tax-overview` with UK 2026/27 tax band calculations and various income sources.
-   **Billing Setup ("Secure Your Head Office")**: Premium upgrade page at `/upgrade` for monthly subscription with Stripe integration.
-   **Health Check & Structured Logging**: `/health` endpoint for GCP readiness; production mode outputs Cloud Logging-compatible JSON with severity levels; `logError()` helper for structured error reporting.
-   **PDF Tax Year Certificate**: Server-side PDFKit generation at `GET /api/final-declaration/:taxYear/certificate` with full tax breakdown, HMRC submission ID, and "Shield of Accuracy" branding.
-   **January 1st Final Declaration Email**: Lifecycle-managed email sent to Pro users in first week of January, promoting £29 Final Declaration with HMRC deadline urgency.
-   **Confetti Animation**: canvas-confetti celebration on successful Final Declaration submission and Stripe payment return.
-   **Geo-Specific Engine**: IP-based country detection on signup (BigDataCloud), stored in `users.detectedCountry`. Drives a `RegionConfig` system (`server/geo-detect.ts`, `client/src/hooks/use-region.ts`) that toggles: UK users see MTD Quarterly, Tax Overview, £ Sterling; US users see Estimated Tax, Schedule C, $ Dollars; Canada (CA) sees CAD + CRA rules; Mexico (MX) sees MXN + SAT/RESICO rules. Region switchable via RegionDetector banner, `PATCH /api/user/detected-country`, or Global Tax Centre page (`/global-tax`).
-   **Global Tax Centre** (`/global-tax`): Dedicated page for selecting country (US/UK/CA/MX), viewing country-specific tax rules (rates, forms, deadlines), and accessing an AI Tax Assistant (Gemini-powered, country-aware chatbot) via `POST /api/global-tax-assistant`.
-   **Mobile-Friendly Dashboard**: Quick-action tiles on mobile (Scan Receipt, Add Income, Log Expense, Log Miles) with large touch targets. OCR receipt button shown as a prominent tile on mobile screens.
-   **Auth0**: Auth0 secrets (AUTH0_DOMAIN, AUTH0_CLIENT_ID, AUTH0_CLIENT_SECRET) configured and active.
-   **USA Tax Engine (1040-ES Worksheet 2-1)**: Full IRS-compliant estimated tax calculator with: Net Profit → SE Tax (15.3% × 92.35%) → SE Deduction → AGI → Standard Deduction ($15,700) → Taxable Income → Federal Income Tax (2026 brackets) → State Tax (50-state engine) → Total Annual Tax → Quarterly Payments. Includes $1,000 underpayment alert (IRC §6654), state-level toggle with all 50 states grouped by tax type, and IRS quarterly deadlines.
-   **Region-Specific Pricing**: UK: £17.99/mo subscription + £29 Final Declaration. USA: $19.99/mo subscription + $35 Annual 1040 Prep. Stripe checkout sessions created with correct currency and product names per region. UpgradePage and TaxOverviewPage adapt feature lists and pricing display.
-   **AI-Powered Features (7 total)**:
    -   **Enhanced Intelligent OCR**: Receipt OCR enriched with `subcategory`, `scheduleCCategory`, `taxDeductible` boolean with `deductibilityReason`, US/UK-aware classification. Files: `server/receipt-ocr.ts`, `client/src/pages/ScanPage.tsx`.
    -   **Statement Parsing**: PDF earnings statement upload via `POST /api/parse-statement` (multer + pdf-parse + Gemini). Extracts gross, fees, tips, net, period. Import to income entries. File: `client/src/components/StatementParser.tsx`.
    -   **Voice Bookkeeping**: Floating mic FAB on all pages via `client/src/components/VoiceBookkeeper.tsx` in Layout.tsx. Web Speech API captures voice, `POST /api/voice-entry` sends transcript to Gemini for NLP parsing into income/expense entries with confirmation card.
    -   **Anomaly Detection**: `GET /api/spending-anomalies` groups expenses by category, flags items > 2 std devs above mean. `SpendingAnomalies` component on Dashboard shows amber dismissible alerts.
    -   **Predictive Maintenance Alerts**: `GET /api/maintenance-predictions` analyzes vehicles + mileage logs + maintenance expenses. Alerts when > 5000 miles since last service. Predicts next service date. `MaintenanceAlerts` component on Dashboard shows blue info cards.
    -   **Profitability Heatmaps**: `GET /api/profitability-heatmap` calculates earnings by day-of-week. `ProfitabilityHeatmap` component (`client/src/components/ProfitabilityHeatmap.tsx`) renders Recharts bar chart with best/worst day badges and insight text.
    -   **Goal Tracking**: `earningsGoal` column in users table. `PATCH /api/earnings-goal` endpoint. `GoalTracker` component on Dashboard shows progress bar, daily run rate, days remaining, and motivational status messages.
    -   **Smart Tax Predictor**: `GET /api/smart-tax-prediction` sends user's YTD financial data to Gemini AI for year-end tax liability forecast. Returns projected income, net profit, SE tax, federal tax, state tax, effective rate, quarterly payments, risk level, saving tips, and savings opportunities. `SmartTaxPredictor` component on Dashboard with on-demand "Analyze" button, 30-minute cache.

## External Dependencies
-   **Auth0**: OpenID Connect (OIDC) authentication.
-   **Google Cloud Storage**: Receipt image storage.
-   **Gemini AI (Google)**: Server-side multimodal OCR.
-   **Stripe**: Subscriptions, checkout, webhooks.
-   **Avalara (AvaTax)**: Optional live tax rate provider.
-   **PostgreSQL**: Primary database.
-   **Resend**: Transactional emails.
-   **IRS RSS Feeds**: Compliance Sentinel monitoring.
-   **BigDataCloud**: Reverse geocoding.
-   **open.er-api.com**: Live forex sync.