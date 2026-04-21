# CREDENTIALS MAP (PRIVATE - DO NOT COMMIT TO PUBLIC REPOS)

This document lists every API key, secret, and service credential required to operate MCTUSA. A new owner must transfer or re-provision each of these to maintain full functionality.

---

## Critical Services

### 1. Auth0 (Authentication)
- **Purpose:** User login, MFA, biometric authentication via OpenID Connect
- **Keys Required:**
  - `AUTH0_DOMAIN` - Your Auth0 tenant domain (e.g., `myapp.us.auth0.com`)
  - `AUTH0_CLIENT_ID` - Application client ID
  - `AUTH0_CLIENT_SECRET` - Application client secret
- **Dashboard:** https://manage.auth0.com
- **Transfer:** Add new owner as admin on Auth0 tenant, or create new tenant and update callback URLs

### 2. Stripe (Payments & Subscriptions)
- **Purpose:** Pro tier billing, checkout sessions, webhook-driven subscription management, optionally Stripe Tax API for live tax rates
- **Keys Required:**
  - `STRIPE_SECRET_KEY` - Server-side API key
  - `STRIPE_PUBLISHABLE_KEY` - Client-side publishable key
  - `STRIPE_WEBHOOK_SECRET` - Webhook endpoint verification
  - `STRIPE_TAX_API_KEY` (Optional) - For live tax rate lookups
- **Dashboard:** https://dashboard.stripe.com
- **Transfer:** Transfer Stripe account ownership or create new account and migrate products/prices

### 3. Google Cloud Platform (Storage + AI)
- **Purpose:** Receipt image storage (GCS) and AI-powered receipt OCR (Gemini)
- **Keys Required:**
  - `GOOGLE_CLOUD_PROJECT_ID` - GCP project identifier
  - `GOOGLE_CLOUD_STORAGE_BUCKET` - GCS bucket name for receipt vault
  - `GEMINI_API_KEY` or GCP service account credentials - For Gemini AI OCR
- **Dashboard:** https://console.cloud.google.com
- **Transfer:** Add new owner to GCP project with Owner role, or export data and create new project

### 4. PostgreSQL Database
- **Purpose:** All application data (users, incomes, expenses, mileage, submissions, audit logs)
- **Keys Required:**
  - `DATABASE_URL` - Full connection string (auto-provisioned on Replit)
- **Current Provider:** Replit (Neon-backed PostgreSQL)
- **Transfer:** Export via `pg_dump`, import to new provider. Schema defined in `shared/schema.ts`, push via `npm run db:push`

### 5. Resend (Transactional Email)
- **Purpose:** Email notifications, submission confirmations
- **Keys Required:**
  - `RESEND_API_KEY` - API key for sending emails
- **Dashboard:** https://resend.com/api-keys
- **Transfer:** Create new API key under new owner's Resend account

---

## Optional Services

### 6. Avalara (AvaTax) - Optional
- **Purpose:** Certified, rooftop-accurate tax rate calculations
- **Keys Required:**
  - `AVALARA_API_KEY` - AvaTax API credentials
- **Dashboard:** https://admin.avalara.com
- **Note:** System gracefully falls back to static rates when not configured

---

## Application Secrets

### 7. Session Management
- **Keys Required:**
  - `SESSION_SECRET` - Express session signing key (generate a random 64-char string)
- **Note:** Changing this will invalidate all active user sessions

---

## Replit-Managed (Auto-Provisioned)

These are automatically provided by the Replit environment:
- `REPL_ID` - Replit instance identifier
- `DEFAULT_OBJECT_STORAGE_BUCKET_ID` - Object storage bucket
- `PUBLIC_OBJECT_SEARCH_PATHS` - Public asset paths
- `PRIVATE_OBJECT_DIR` - Private object directory

---

## Quick Start for New Owner

1. Provision Auth0 tenant, set `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`
2. Create Stripe account, set `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`
3. Set up GCP project with GCS bucket and Gemini API access
4. Provision PostgreSQL database, set `DATABASE_URL`
5. Run `npm run db:push` to create schema
6. Set `SESSION_SECRET` to a random 64-character string
7. (Optional) Configure `RESEND_API_KEY` for email
8. (Optional) Configure `AVALARA_API_KEY` or `STRIPE_TAX_API_KEY` for live tax rates
9. Run `npm run dev` (development) or `npm run build && npm start` (production)
