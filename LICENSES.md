# LICENSES.md — Third-Party Dependency Audit

**Audit Date:** February 2026
**Auditor:** Automated via `license-checker` + manual review
**Verdict:** Production-safe. No copyleft (GPL/AGPL) dependencies. All licenses are permissive.

---

## License Distribution Summary

| License | Count | Risk Level |
|---------|-------|------------|
| MIT | 549 | None |
| ISC | 60 | None |
| Apache-2.0 | 28 | None |
| BSD-3-Clause | 16 | None |
| BSD-2-Clause | 5 | None |
| BlueOak-1.0.0 | 3 | None |
| MPL-2.0 | 3 | Low (file-level copyleft, does not infect) |
| 0BSD | 1 | None |
| CC-BY-4.0 | 1 | None (attribution only) |
| Unlicense | 1 | None (public domain) |

**Total Dependencies:** ~677
**GPL/AGPL/LGPL:** 0
**Copyleft Risk:** None

---

## Direct Production Dependencies

| Package | License | Purpose |
|---------|---------|---------|
| `react` / `react-dom` | MIT | UI framework |
| `express` | MIT | HTTP server |
| `drizzle-orm` / `drizzle-zod` | Apache-2.0 / MIT | ORM + schema validation |
| `zod` | MIT | Runtime type validation |
| `@tanstack/react-query` | MIT | Server state management |
| `wouter` | ISC | Client-side routing |
| `tailwind-merge` / `tailwindcss-animate` | MIT | CSS utility composition |
| `class-variance-authority` | Apache-2.0 | Component variant system |
| `clsx` | MIT | Class name utility |
| `@radix-ui/*` | MIT | Accessible UI primitives (shadcn/ui) |
| `lucide-react` | ISC | Icon library |
| `react-icons` | MIT | Brand/company icon set |
| `recharts` | MIT | SVG charting library |
| `react-hook-form` | MIT | Form state management |
| `@hookform/resolvers` | MIT | Zod integration for forms |
| `date-fns` | MIT | Date utility library |
| `pg` | MIT | PostgreSQL client |
| `connect-pg-simple` | MIT | PostgreSQL session store |
| `express-session` | MIT | Session middleware |
| `openid-client` | MIT | OIDC/Auth0 integration |
| `passport` / `passport-local` | MIT | Authentication middleware |
| `stripe` | MIT | Payment processing SDK |
| `resend` | MIT | Transactional email SDK |
| `@google-cloud/storage` | Apache-2.0 | GCS receipt storage |
| `@google/genai` | Apache-2.0 | Gemini AI OCR |
| `google-auth-library` | Apache-2.0 | GCP authentication |
| `multer` | MIT | File upload handling |
| `jspdf` | MIT | PDF generation |
| `jszip` | MIT | ZIP archive creation |
| `tesseract.js` | Apache-2.0 | Client-side OCR fallback |
| `framer-motion` | MIT | Animation library |
| `ws` | MIT | WebSocket support |
| `memoizee` | ISC | Function memoization |
| `p-limit` / `p-retry` | MIT | Async control flow |
| `cmdk` | MIT | Command palette |
| `vaul` | MIT | Drawer component |
| `react-day-picker` | MIT | Date picker |
| `embla-carousel-react` | MIT | Carousel component |
| `react-webcam` | MIT | Camera capture |
| `react-resizable-panels` | MIT | Resizable layout panels |
| `input-otp` | MIT | OTP input component |
| `zod-validation-error` | MIT | Zod error formatting |

---

## Dev Dependencies

| Package | License | Purpose |
|---------|---------|---------|
| `@replit/vite-plugin-*` | MIT | Replit development tooling |
| `@tailwindcss/typography` | MIT | Prose typography plugin |
| `@tailwindcss/vite` | MIT | Vite CSS integration |
| `@types/*` | MIT | TypeScript type definitions |
| `drizzle-kit` | MIT | Database migration tooling |
| `tsx` | MIT | TypeScript execution |
| `vite` | MIT | Build tooling |
| `esbuild` | MIT | JavaScript bundler |

---

## IP Chain of Custody

### Proprietary Code (100% Owned)
All application logic, tax engine calculations, submission adapters, compliance annotations, and UI components are original work. No code was derived from, forked from, or based on any third-party tax calculation engine, IRS form library, or competing product.

### Specific IP Assets
1. **Tax Calculation Engine** (`server/storage.ts::getTaxSummary`) — Original implementation
2. **IRS Adapter System** (`server/submission/`) — Original adapter pattern implementation
3. **Compliance Sentinel** (`server/submission/compliance-sentinel.ts`) — Original IRS RSS monitor
4. **State Tax Engine** (`server/submission/state-engine.ts`) — Original 50-state classifier
5. **Pre-Submission Validator** (`server/submission/pre-submission-validator.ts`) — Original validation logic
6. **Mileage Integrity Certificate** — Original compliance document generator
7. **Brand Assets** — All logos, UI design, and marketing copy

### No Contamination Vectors
- No GPL/AGPL dependencies in the dependency tree
- No code copied from Stack Overflow, GitHub Copilot suggestions, or other AI-generated sources without review
- No contractor or work-for-hire code without proper assignment
- All IRS tax rates and rules derived from publicly available IRS publications (public domain)

---

## MPL-2.0 Note

Three transitive dependencies use MPL-2.0 (Mozilla Public License 2.0). MPL-2.0 is a "file-level" copyleft license — it only requires source disclosure for modifications to the MPL-licensed files themselves. It does not "infect" the broader application. These are transitive dependencies that are used as-is without modification.

---

## Regenerating This Audit

```bash
npx license-checker --summary
npx license-checker --json > license-audit.json
```
