# MCTUSA: Architectural Blueprint

## 1. Core Tech Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Frontend** | React 18 + Vite 7 | Fast HMR, tree-shaking, modern JSX transform. Vite eliminates CRA bloat and deploys to a single static bundle. |
| **UI Framework** | TailwindCSS + shadcn/ui | Utility-first CSS with accessible, composable Radix-based components. Dark mode via class toggling. |
| **State/Data** | TanStack Query v5 | Server-state cache with automatic invalidation. Eliminates manual fetch logic and keeps UI in sync with the backend. |
| **Backend** | Express 5 (Node.js) | Lightweight HTTP layer. Routes are thin wrappers around a typed `IStorage` interface, making the backend easy to swap or scale. |
| **ORM** | Drizzle ORM | Type-safe SQL builder with zero runtime overhead. Schema is the single source of truth for both DB and API validation via `drizzle-zod`. |
| **Database** | PostgreSQL (Neon) | ACID-compliant, battle-tested relational DB. Ideal for financial data where consistency and audit trails are non-negotiable. |
| **Auth** | Auth0 (OIDC) | Enterprise-grade authentication with MFA/biometric support. Decouples identity management from application logic. |
| **Payments** | Stripe | PCI-compliant subscription billing with webhook-driven lifecycle management. |
| **Storage** | Google Cloud Storage | Receipt images stored in user-scoped paths with configurable retention (90d Basic / 7yr Pro). |
| **AI/OCR** | Google Gemini AI | Multimodal receipt scanning. Extracts merchant, amount, date, and category from photos without third-party OCR services. |
| **Charts** | Recharts | Declarative SVG charting for tax summary visualizations on the Dashboard. |

### Why Replit?

Replit provides an integrated development + deployment environment that collapses the DevOps surface area to zero. For a lean startup, this means:
- No CI/CD pipeline maintenance
- Built-in PostgreSQL provisioning
- One-click deployment with TLS and health checks
- Object storage integration for receipt vault

### Production Path

The `Dockerfile` and `cloudbuild.yaml` are included for Google Cloud Run deployment when scale demands exceed Replit's hosting. The architecture is stateless (session in DB, files in GCS), so horizontal scaling requires no code changes.

---

## 2. The "Sovereignty" Logic

### Why Tax Math Stays Local

MCTUSA performs all tax calculations on the server within `server/storage.ts::getTaxSummary()`. This is a deliberate architectural decision:

**Privacy**: Driver income data never leaves the application boundary for computation. We do not call external tax calculation APIs with user financial data.

**Auditability**: Every number on the Schedule C can be traced to a deterministic function with known inputs. There is no "black box" third-party calculation that could change between API versions.

**Offline Resilience**: The tax engine works with static IRS rates from `shared/schema.ts` constants. Live rate providers (Stripe Tax, Avalara) are optional enhancers, not dependencies.

**Compliance Certainty**: IRS audit defense requires proving how numbers were derived. A local engine with immutable constants and hash-verified outputs (SHA-256 `submissionHash`) provides a provable chain from raw data to filed return.

### The Rate Provider Hierarchy

```
Request for state tax rate
        │
        ▼
┌─────────────────────┐
│  Stripe Tax API     │◄── If STRIPE_TAX_API_KEY configured
│  (Live, certified)  │
└────────┬────────────┘
         │ fallback
         ▼
┌─────────────────────┐
│  Avalara AvaTax API │◄── If AVALARA_API_KEY configured
│  (Live, rooftop)    │
└────────┬────────────┘
         │ fallback
         ▼
┌─────────────────────┐
│  Static states.json │◄── Always available, zero external deps
│  (Bundled rates)    │
└─────────────────────┘
```

Rates are cached in `tax_rate_cache` table with a 24-hour TTL. Rate changes >0.1% trigger compliance alerts.

---

## 3. Data Flow: Receipt to Tax Form

```
┌─────────────┐
│   CAMERA    │  User captures receipt photo
└──────┬──────┘
       │
       ▼
┌─────────────────────┐
│   UPLOAD ENDPOINT   │  POST /api/receipts
│   (Multer + GCS)    │  File validated, stored in user-scoped path
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│   GEMINI AI OCR     │  server/receipt-ocr.ts
│   (Multimodal)      │  Extracts: merchant, amount, date, category
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│   EXPENSE FORM      │  Auto-populated with OCR data
│   (React Hook Form) │  User reviews and confirms
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│   POSTGRESQL        │  expenses table + receipts table linked
│   (Drizzle ORM)     │  Category mapped to IRS Schedule C line item
└──────┬──────────────┘
       │
       ▼
┌─────────────────────────────────────┐
│   TAX SUMMARY ENGINE               │  server/storage.ts::getTaxSummary()
│                                     │
│   Gross Income                      │
│   - Platform Fees                   │
│   - Mileage Deduction (IRS rate)    │
│   - Business Expenses (by cat.)     │
│   - Tip Exemption (2026 OBBBA)      │
│   = Net Profit (Schedule C Line 31) │
│                                     │
│   SE Tax (15.3% on 92.35% of net)   │
│   Federal Tax (2026 brackets)       │
│   Quarterly Est. Payments           │
└──────┬──────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────┐
│   EXPORT / SUBMISSION               │
│                                     │
│   ┌─────────────┐ ┌──────────────┐  │
│   │ ZIP Export   │ │ IRS Adapter  │  │
│   │ (PDF + CSV)  │ │ (JSON+Hash)  │  │
│   └─────────────┘ └──────────────┘  │
│                                     │
│   ┌─────────────────────────────┐   │
│   │ Vault PDF Provider          │   │
│   │ (Audit-grade PDF + GCS)     │   │
│   └─────────────────────────────┘   │
└─────────────────────────────────────┘
```

---

## 4. Module Map

```
shared/
  schema.ts          ← Single source of truth: tables, types, IRS constants
  models/auth.ts     ← User type definitions
  routes.ts          ← Shared route constants

server/
  index.ts           ← Express bootstrap, middleware, Auth0 OIDC
  routes.ts          ← API endpoints (thin, delegates to storage)
  storage.ts         ← IStorage interface + DatabaseStorage implementation
  db.ts              ← Drizzle + PostgreSQL connection
  receipt-ocr.ts     ← Gemini AI multimodal OCR
  receipt-vault.ts   ← GCS upload with retention policies
  resend.ts          ← Transactional email via Resend
  cleanup-worker.ts  ← Scheduled receipt expiration worker
  vite.ts            ← Dev server middleware (Vite HMR proxy)

  submission/
    index.ts              ← Adapter registry (VaultPDF, EFile)
    types.ts              ← SubmissionProvider interface
    irs-adapter.ts        ← Schedule C JSON payload builder + SHA-256 hash
    vault-pdf-provider.ts ← Audit-grade PDF generation with watermarks
    efile-provider.ts     ← Future IRS e-filing placeholder
    state-engine.ts       ← 50-state tax bucket classifier
    jurisdiction-rules.ts ← State-specific warnings and rules
    tax-rate-provider.ts  ← Live rate engine (Stripe/Avalara/Static)
    compliance-sentinel.ts← IRS RSS feed monitor
    pre-submission-validator.ts ← Pre-filing error checks
    audit-dossier.ts      ← Audit defense evidence PDF
    local-tax-provider.ts ← City/county tax calculations

client/src/
  App.tsx             ← Router, sidebar, providers
  pages/              ← Dashboard, Incomes, Expenses, Mileage, Vehicles, etc.
  components/forms/   ← IncomeForm, ExpenseForm, MileageLogForm, etc.
  components/ui/      ← shadcn/ui primitives
  hooks/              ← TanStack Query hooks (use-auth, use-tax, etc.)
  lib/queryClient.ts  ← Fetch wrapper + cache config
```

---

## 5. Key Design Decisions

| Decision | Why |
|----------|-----|
| Schema-first with Drizzle + Zod | A single `schema.ts` generates DB tables, API validation, and TypeScript types. Zero drift between layers. |
| Adapter pattern for submission | `SubmissionProvider` interface allows swapping between PDF export, vault storage, and future IRS e-filing without changing business logic. |
| IRS constants as code | `IRS_MILEAGE_RATE`, `SALT_DEDUCTION_CAP`, `SE_TAX_RATE` live in `schema.ts`. Year-over-year updates are single-line changes with full test coverage. |
| Hash-verified submissions | Every filing gets a SHA-256 `submissionHash` over the JSON payload. This creates a tamper-evident audit trail for 7-year retention. |
| Modular state tax engine | The `UniversalStateEngine` classifies all 50 states into four buckets (None, Flat, Graduated, Decoupled). Adding a new state's rules is a configuration change, not a code change. |
