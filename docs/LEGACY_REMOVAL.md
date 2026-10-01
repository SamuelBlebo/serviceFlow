# Legacy removal checklist

The Express + Prisma API (`apps/backend`, `packages/database`) stays **frozen but green** until every domain has a working Firebase replacement. A legacy module and its tests are deleted only in the same change that lands the replacement **and** its test coverage. When every row is done, delete `apps/backend`, `packages/database`, the root `.env.example` and the `*:legacy` / `db:*` root scripts.

Legend: ⬜ not started · 🟨 partially replaced (pure logic ported, service not yet built) · ✅ replaced and legacy removed

| Legacy module | Replacement | Legacy tests → replacement coverage | Status |
| --- | --- | --- | --- |
| `modules/bookings/booking-state-machine.ts` | `packages/shared/src/bookings/state-machine.ts` | 11 tests ported verbatim + exhaustive helper tests | 🟨 logic ported; delete with the bookings service |
| `modules/matching/matching.service.ts` (scoring) | `packages/shared/src/matching/{score,eligibility}.ts` | 8 tests ported + new eligibility/ranking tests | 🟨 logic ported; Firestore query in Matching stage |
| `modules/commission/commission.service.ts` | `packages/shared/src/commission/{split,resolve}.ts` | 4 tests restated in pesewas + precedence tests | 🟨 logic ported; Firestore lookup in Bookings/Payments stages |
| `modules/wallet/wallet.service.ts` | `packages/shared/src/wallet/ledger.ts` + wallet Functions | New ledger/payout-guard tests | 🟨 math ported; Functions in Wallet stage |
| `modules/whatsapp/conversation-handlers.ts` (pure parts) | `packages/shared/src/whatsapp/text.ts` | 5 tests ported (explicit time zone) | 🟨 pure parts ported; engine in WhatsApp stage |
| `modules/whatsapp/*provider*`, `whatsapp-security.ts` | `apps/functions/src/integrations/whatsapp/*` | New signature + parser tests | 🟨 moved in, not wired |
| `modules/payments/*` | `apps/functions/src/integrations/payments/*` + Payments stage | — | 🟨 interface + mock moved in, not wired |
| `common/middleware/auth.ts` (+ `auth.test.ts`) | `apps/functions/src/lib/guards.ts` + Security Rules | 6 middleware tests → guard tests + rules tests | 🟨 guards built; delete with Auth stage |
| `modules/auth/*` (JWT, OTP) (+ `jwt.test.ts`) | Firebase Auth + Auth stage callables | 3 JWT tests → Auth emulator tests | ⬜ Auth stage |
| `app.test.ts` (HTTP) | callable/rules tests | health, validation, 401/403 cases → `health.test.ts`, `guards.test.ts`, rules tests | 🟨 equivalents exist |
| `modules/services/*` | `services` collection + admin callables | — | ⬜ Services stage |
| `modules/technicians/*` | `technicians` + verification callables | — | ⬜ Technician onboarding stage |
| `modules/bookings/bookings.service.ts` | booking domain service + callables | — | ⬜ Bookings stage |
| `modules/ratings/ratings.service.ts` | `ratings-submit` callable | — | ⬜ Bookings/Ratings stage |
| `packages/shared/src/{phone,geo,errors}.ts` | unchanged (already shared) | 15 tests kept | ✅ nothing to remove |
| `packages/database` (Prisma) | Firestore data model (§8) | — | ⬜ last |
| `scripts/bootstrap-admin.ts` | Admin SDK bootstrap script | — | ⬜ Auth stage |

Legacy defects D-1…D-16 (SERVICEFLOW_MIGRATION_PLAN.md §5.14) are fixed in the replacements, not back-ported. D-17 (typecheck error) was fixed in Stage 2 so the legacy code stays green.
