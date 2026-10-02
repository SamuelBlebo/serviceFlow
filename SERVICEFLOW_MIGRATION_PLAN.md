# ServiceFlow — Repository Audit & Migration Plan (Stage 1)

| | |
| --- | --- |
| Status | **Stage 7 (Bookings) complete (2026-10-02). Stage 8 (Matching) not started.** Stage records: §20.5 (Stage 2), §21 (Stage 3), §22 (Stage 4), §23 (Stage 5), §24 (Stage 6), §25 (Stage 7). |
| Date | 2026-09-30 |
| Audited commit | `effae03` (main): "Initial commit: Home Service backend + WhatsApp booking slice" |
| Scope | Audit and blueprint only. No code, data, Firebase or deployment changes were made |

---

## 1. Executive summary

The repository is a well-structured but **backend-only** first slice of the product. It has an Express + Prisma + PostgreSQL API, a complete relational schema, and a WhatsApp conversation that takes a customer from "Hi" to a job offered to a technician. There is **no web app, no mobile app and no Firebase code**.

The most valuable parts are its **business rules**, and nearly all of them are already isolated from the framework:

- the booking state machine and who may trigger each transition
- deterministic technician matching
- commission precedence and snapshotting
- the append-only wallet ledger
- the payment and WhatsApp provider abstractions
- Ghana phone normalisation

These carry over into shared TypeScript packages almost unchanged, together with their tests.

The Express/Prisma/JWT layer is replaced by Firebase:

- **Firebase Auth** with capability claims
- **Firestore**, read directly by clients under Security Rules
- **Cloud Functions**, the only place privileged writes and money movements happen
- **Storage** for media
- **FCM** for push notifications

Web, mobile and WhatsApp become three thin clients of one backend. Every state change goes through the same Function-hosted domain services.

The audit also found **17 defects** in the current logic (§5.14). Four are security issues:

- any customer can cancel another customer's booking
- the customer chooses the final price
- a payout can be reversed twice
- WhatsApp webhook retries create duplicate bookings

They are fixed as part of the port, not carried over.

**Verified baseline:** 60/60 tests pass. The backend **typecheck fails** (1 error), and **`pnpm install` fails** on pnpm 11. The dev machine has **no Java and no Firebase CLI**, and both are needed for the emulators. Stage 2 fixes all of this.

**Stage 2** (§20) builds the foundation only:

- monorepo restructure and ServiceFlow rename
- shared domain packages with the ported logic and tests
- Firebase project config running **only on local emulators**, with deny-by-default rules
- a Functions skeleton and seed data
- minimal web and mobile shells that prove the end-to-end path by reading the service catalogue from Firestore

No feature migration happens in Stage 2.

---

## 2. Current architecture

```text
            (no web or mobile clients exist yet)
                          │
 WhatsApp (Meta Cloud API or mock JSON)      REST clients (curl / future apps)
                          │                             │
                          ▼                             ▼
     ┌──────────────────────────────────────────────────────────┐
     │  apps/backend — Express 4 + TypeScript                   │
     │  helmet · cors · pino · express-rate-limit · zod         │
     │  JWT auth middleware → requireRole RBAC                  │
     │  routes → controllers → services (business logic)        │
     │  provider adapters: PaymentProvider, WhatsAppProvider    │
     └──────────────────────────────────────────────────────────┘
                          │  Prisma Client ($transaction)
                          ▼
                PostgreSQL (25 tables, 18 enums)
```

- **Request path:** Express router → `asyncHandler` → controller (zod parse) → service → Prisma → `errorHandler` maps `AppError.httpStatus` to JSON.
- **Identity:** a JWT access token (15 min) carries `{sub, role}`, and a refresh token (30 days) uses a separate secret. The role is **one per user** (`CUSTOMER | TECHNICIAN | ADMIN`).
- **Consistency:** Postgres transactions wrap status transitions, payment finalisation and wallet movements.
- **External:** only mock providers are active. The Meta Cloud API adapter is written but untested against Meta.
- **Legacy verification note:** the README states that Prisma was never generated in the original sandbox. I generated it successfully for this audit.

---

## 3. Current repository structure

```text
serviceFlow/                      root package "home-service" (pnpm workspaces)
├── .env.example                  DB, JWT, OTP, WhatsApp, payments, app defaults
├── package.json                  build/dev/test/typecheck/db:* scripts
├── pnpm-workspace.yaml           apps/*, packages/*
├── tsconfig.base.json            strict, noUncheckedIndexedAccess, commonjs, ES2022
├── README.md
├── apps/backend/
│   ├── vitest.config.ts          aliases @home-service/*; test env vars
│   └── src/
│       ├── app.ts / server.ts    Express assembly (raw body kept for webhook HMAC)
│       ├── config/env.ts         zod-validated env, fails fast
│       ├── config/logger.ts      pino
│       ├── common/               asyncHandler, requireParam, auth + RBAC middleware, errorHandler
│       ├── scripts/bootstrap-admin.ts
│       └── modules/
│           ├── auth/             OTP + admin password + JWT
│           ├── services/         catalogue CRUD
│           ├── technicians/      self-service + admin verification
│           ├── bookings/         state machine + service + admin
│           ├── matching/         deterministic ranking
│           ├── commission/       precedence + split
│           ├── payments/         provider interface, mock, orchestration
│           ├── wallet/           ledger, withdrawals, payouts
│           ├── ratings/          rating + review + aggregate
│           └── whatsapp/         provider interface, Meta + mock adapters, HMAC check, conversation engine
└── packages/
    ├── database/                 Prisma schema, seed, client singleton  (@home-service/database)
    └── shared/                   phone, geo, typed errors               (@home-service/shared)
```

### REST surface (37 endpoints)

| Group | Endpoints |
| --- | --- |
| `/health` | 1 |
| `/api/v1/auth` | `otp/request`, `otp/verify`, `admin/login`, `refresh` |
| `/api/v1/services` | public list + admin list/create/update/set-active |
| `/api/v1/technicians/me` | create/get profile, availability toggle, services, service areas, availability windows, verification, jobs list, respond, advance, wallet, withdraw |
| `/api/v1/technicians/admin` | list, get, approve, reject, suspend, reactivate |
| `/api/v1/bookings` | get, confirm, cancel, pay, rating, plus admin list and reassign |
| `/api/v1/whatsapp/webhook` | GET verify, POST inbound |

### Baseline health (run during this audit)

| Check | Result |
| --- | --- |
| `pnpm install` (pnpm 11.22, Node 24.19) | **Fails:** `ERR_PNPM_IGNORED_BUILDS`, because Prisma and esbuild build scripts aren't allow-listed |
| `prisma generate` (invoked directly) | OK |
| `packages/shared` tests | **15/15 pass** (phone 12, geo 3) |
| `apps/backend` tests | **45/45 pass**: state machine 11, matching 8, app HTTP 8, RBAC middleware 6, WhatsApp handlers 5, commission 4, JWT 3 |
| `apps/backend` typecheck | **1 error:** `ratings.service.ts:14`, where `[CUSTOMER_CONFIRMED, PAID].includes(booking.status)` is rejected by the narrowed tuple type |
| Java / Firebase CLI | **Not installed.** Required for the emulators |
| Git | Clean, one commit, no lockfile committed |

Side effects of the audit: `pnpm install` added placeholder entries to `pnpm-workspace.yaml` and created a lockfile. **Both were reverted.** `node_modules` and the generated Prisma client are git-ignored.

---

## 4. Existing functionality: module inventory

Each module lists: **Current**, **Where**, **How it works**, **Preserve**, **Redesign**, **Replace**.

### 4.1 Authentication

- **Current:** phone + OTP for customers and technicians. Email + bcrypt password for admins. JWT access and refresh tokens.
- **Where:** `modules/auth/*`, `common/middleware/auth.ts`, `scripts/bootstrap-admin.ts`
- **How:**
  - `otp/request` validates a Ghana phone number and **upserts** a user with the requested role. If the phone is already registered with a different role, it errors.
  - A 6-digit code is created with `Math.random`, bcrypt-hashed, and expires after 5 minutes. It is logged by the mock provider.
  - Verification allows a maximum of 5 attempts and consumes the code on success.
  - Suspended users are blocked at login and refresh.
  - Admin passwords are set only by the bootstrap script.
  - OTP endpoints are rate-limited to 5 per minute per IP.
- **Preserve:** phone-first onboarding (no separate "sign up"), Ghana number validation and normalisation, OTP expiry and attempt caps, suspension blocking access, admins created only by a trusted path, and admins never created through public sign-up.
- **Redesign:** a single role per user becomes **capabilities**: everyone is a customer, and `tech` and `admin` are claims. Suspension must take effect immediately, not when the token expires.
- **Replace:** JWT, refresh tokens, the bcrypt admin password and the `OtpCode` table are replaced by **Firebase Auth**. OTP delivery is decided by D2 (§9). The IP rate limiter is replaced by App Check plus per-phone and per-uid limits.

### 4.2 Authorisation / RBAC

- **Current:** `authenticate` (JWT → `req.auth`), `requireRole(...)`, plus per-service ownership checks.
- **Preserve:** identity only ever comes from a signed token, never from the request body. Defence in depth means a role gate **and** an ownership check.
- **Replace:** route middleware becomes **Firestore/Storage Security Rules** (for direct reads) plus **callable guards** (`requireAuth`, `requireClaim`, ownership assertions) in Functions.

### 4.3 Services catalogue

- **Current:** `Service` rows (name, slug, description, icon, `basePriceMin/Max`, `isActive`). The public list shows active services. Admins create, update and toggle them. Three services are seeded (Plumbing, Electrical, AC Repair & Maintenance).
- **Preserve:** services are **data, never hard-coded**. Inactive services are hidden from booking. The price range is used as the booking estimate.
- **Redesign:** money is stored in pesewas, and admin changes are recorded in the audit log (they aren't today).
- **Replace:** the `services/{id}` collection. Public read is allowed by rules, and writes go through an admin callable.

### 4.4 Technicians: profile, skills, areas, availability

- **Current:**
  - `TechnicianProfile`: name, photo URL, bio, years of experience, `verificationStatus`, `isAvailable` online toggle, and cached stats (rating, completed, cancelled, offered, responded).
  - Related tables: `TechnicianService`, `ServiceArea` (centre + radius, default 10 km) and `Availability` (day of week plus `HH:mm` window, one row per day).
  - A jobs list is grouped into tabs: new, upcoming, active, completed, cancelled.
- **Preserve:**
  - Stats are **server-computed and never client-editable**.
  - Location is only captured en route, with no continuous tracking.
  - The job tab groupings.
  - Services can only be added if they are active.
- **Redesign:**
  - Skills, areas and availability become bounded arrays on one doc, so matching reads one document per technician.
  - The online toggle is allowed only when VERIFIED.
  - Areas are chosen from a seeded `serviceAreas` catalogue (with an optional custom pin).
- **Replace:** the `technicians/{uid}` doc. Owner writes are restricted to allow-listed fields, and anything that affects matching eligibility goes through a callable.

### 4.5 Technician verification

- **Current:** a technician submits an ID type, ID number, ID photo URL and an optional selfie URL. A `TechnicianVerification` row is created and the profile is set to PENDING. An admin approves, rejects, suspends or reactivates. That updates the profile, marks the latest PENDING verification reviewed (with notes, reviewer and time), forces `isAvailable=false` unless VERIFIED, and writes an `AdminAction` row.
- **Preserve:** the admin-only decision, verification history (multiple submissions), review notes and reviewer, the audit record, and going offline automatically on anything other than VERIFIED.
- **Redesign:**
  - Uploads go to private Storage.
  - Ghana Card is the first-class ID type.
  - **A resubmission must not overwrite SUSPENDED or VERIFIED status** (defect D-9).
- **Replace:** the `technicianVerifications/{id}` collection, the Storage path `verifications/{uid}/…`, and the `technicians-submitVerification` and `admin-reviewTechnician` callables.

### 4.6 Bookings and the state machine

- **Current:** `booking-state-machine.ts` defines, for each status, the allowed next statuses and **which actor** (`SYSTEM`, `CUSTOMER`, `TECHNICIAN`, `ADMIN`) may trigger each one. `bookings.service.transition()`:
  - re-reads the status inside a transaction
  - validates the actor and the transition
  - updates the booking
  - appends a `BookingStatusHistory` row

  Everything else is built on top of it: create (REQUESTED, with the estimate copied from the service), match, offer, respond, advance, confirm, cancel and admin reassign.
- **Preserve:** the entire transition table (§5.1), history on every transition, re-validation inside the transaction, the commission snapshot at confirmation, and soft-delete only.
- **Redesign:**
  - ownership checks on cancel and pay
  - the price authority rule
  - candidate-restricted offers
  - offer expiry
  - stuck-MATCHING expiry
  - declines stored as a field instead of parsed from history notes
- **Replace:** `bookings/{id}` + `statusHistory` subcollection, written only by Functions.

### 4.7 Matching

- **Current:**
  - Prisma filter: VERIFIED + `isAvailable` + offers the service + an active availability window covering the needed day and time.
  - In memory: the nearest covering service area (haversine within `radiusKm`).
  - Scoring with `computeMatchScore`, sorting with `sortCandidates`, then taking the top 3, excluding technicians who declined.
- **Preserve:** the hard filters, the weights, the neutral prior for new technicians, the deterministic tie-break, "top 3", and decline exclusion.
- **Redesign:** eligibility filtering becomes a **pure function** (it is currently embedded in a Prisma query), and uses an explicit time zone.
- **Replace:** a Firestore query on indexed fields, then pure filtering and scoring inside a Function.

### 4.8 Commission

- **Current:** precedence is TECHNICIAN → SERVICE → GLOBAL (latest) → `DEFAULT_COMMISSION_PERCENT` (15). The split is rounded to 2 decimal places, and the percentage is snapshotted on the booking at CUSTOMER_CONFIRMED.
- **Preserve:** the precedence, the snapshot rule, and that commission is never hard-coded.
- **Redesign:** integer pesewas (the split must sum exactly to the gross), and commission-rule changes are audited.
- **Replace:** `commissionRules/{id}` + `settings/platform.defaultCommissionPercent`, resolved inside Functions.

### 4.9 Payments

- **Current:** a `PaymentProvider` interface (initiate, verify, refund, transferToTechnician) and a `MockPaymentProvider` that succeeds synchronously. The factory is the only place a provider is chosen.
  - `confirmJobCompletion` creates the `Payment` invoice (amount, commission, net).
  - `pay` calls the provider and logs a `PaymentTransaction`.
  - On success, one transaction sets the payment SUCCEEDED, moves the booking to PAID (SYSTEM actor) and credits the wallet.
  - **There is no webhook endpoint.**
- **Preserve:** provider abstraction, invoice separate from the attempt log, PAID only by SYSTEM, and atomic "paid + status + wallet".
- **Redesign:** asynchronous Mobile Money (PENDING → webhook), signature verification, webhook dedupe, server-side re-verification, a reconciliation poller, refunds and cash handling.
- **Replace:** Functions: the `payments-initiate` callable, `webhooks-payments` HTTP, and a scheduled reconciliation job.

### 4.10 Wallet and payouts

- **Current:** `Wallet` (available, pending, total earnings) and `WalletTransaction`, which is append-only with `balanceAfter`.
  - Earnings credit **net** amounts.
  - A withdrawal validates the balance, creates a `Payout` PENDING, writes a WITHDRAWAL_DEBIT and moves available → pending.
  - `completePayout` decrements pending.
  - `failPayout` writes a WITHDRAWAL_REVERSAL_CREDIT and moves pending → available.
  - `COMMISSION_DEBIT` and `ADJUSTMENT_*` exist in the enum but are unused.
  - There is no endpoint for admins to process payouts.
- **Preserve:** the ledger is the source of truth, rows are immutable, corrections are made with offsetting rows, withdrawals reserve funds, and failures reverse them.
- **Redesign:** payout state guards (defect D-3), idempotent entry IDs, commission and cash representation (D5), admin payout processing, and nightly reconciliation.
- **Replace:** `wallets/{uid}` + `transactions` subcollection + `payouts/{id}`, all written only by Functions.

### 4.11 Ratings and reviews

- **Current:** 1–5 integer score, only by the booking's customer, only at CUSTOMER_CONFIRMED or PAID, once per booking. An optional `Review` comment (1:1). The technician's `averageRating` is recomputed by aggregate.
- **Preserve:** all of those rules.
- **Redesign:** fold the review into the rating doc, and keep an incremental aggregate (`ratingSum`, `ratingCount`) instead of scanning all ratings.
- **Replace:** `ratings/{bookingId}` + the `ratings-submit` callable + stats update in the same transaction.

### 4.12 Disputes

- **Current:** `Dispute` model only: raised by customer or technician, description, technician response, status (OPEN, UNDER_REVIEW, RESOLVED, REJECTED), resolution notes, refund amount and resolver. The state machine allows `IN_PROGRESS | COMPLETED | CUSTOMER_CONFIRMED | PAID → DISPUTED` (customer, technician, admin) and `DISPUTED → CANCELLED | PAID` (admin only). **No service or endpoint exists.**
- **Preserve:** the model semantics and the transitions.
- **Build new:** `disputes/{id}`, open/respond/resolve callables, and refund and ledger adjustments on resolution.

### 4.13 Notifications, messages and media

- **Current:** schema only.
  - `Notification`: user, type, channel (PUSH, WHATSAPP, SMS, EMAIL), status, sent/read times.
  - `Message`: booking, sender, receiver, channel, body, media.
  - `Media`: URL, type, context (BOOKING_PROBLEM, WORK_PORTFOLIO, VERIFICATION_ID, VERIFICATION_SELFIE, PROFILE_PHOTO).

  Nothing sends notifications. Media URLs are **client-supplied strings**, with no upload handling.
- **Preserve:** the channel abstraction, the event list, and the media contexts.
- **Build new:** transactional outbox → dispatcher (FCM, WhatsApp templates, in-app; SMS and email later), Firebase Storage with rules, and in-app booking messages.

### 4.14 WhatsApp

Covered in detail in §13.

- **Preserve:** provider interface, Meta adapter, HMAC verification, a persisted conversation state machine per phone, and handlers calling the **booking service**.
- **Replace:** the Express webhook becomes a Functions HTTP endpoint with a queue.

### 4.15 Admin actions (audit)

- **Current:** `AdminAction` (admin, actionType, targetType, targetId, metadata) is written only for technician verification decisions.
- **Preserve:** an immutable admin audit log.
- **Redesign:** **every** privileged action writes one, including booking reassign, service changes, commission, payouts, adjustments, disputes, suspensions, settings and claim grants.

### 4.16 Configuration, scripts and docs

- `env.ts` validates everything with zod and fails fast. Keep the pattern: Functions use `defineString` / `defineSecret` with validation.
- Scripts: `db:generate`, `db:migrate`, `db:seed`, `bootstrap:admin`. These become emulator seed and admin bootstrap using the Admin SDK.
- The seed contains 3 services, a global 15% commission, a placeholder admin, 4 Accra technicians (East Legon, Osu, Adenta, Cantonments; Mon–Sat 08:00–18:00; 8 km radius) and 1 test customer. It is ported to Firestore and expanded with Accra areas.

---

## 5. Business logic to preserve

For every rule: where it runs in the future. **Server** means Cloud Functions with the Admin SDK. **Client** means UI hints only; nothing a client does is authoritative.

### 5.1 Booking state machine

**Current:** `booking-state-machine.ts` + `bookings.service.transition()`.

| From | To | Allowed actors |
| --- | --- | --- |
| REQUESTED | MATCHING | SYSTEM |
| REQUESTED | CANCELLED | CUSTOMER, ADMIN |
| MATCHING | OFFERED | SYSTEM, CUSTOMER (customer selecting a candidate) |
| MATCHING | CANCELLED | CUSTOMER, ADMIN |
| OFFERED | ACCEPTED | TECHNICIAN |
| OFFERED | MATCHING | TECHNICIAN (decline), SYSTEM (expiry), ADMIN (reassign) |
| OFFERED | CANCELLED | CUSTOMER, ADMIN |
| ACCEPTED | EN_ROUTE | TECHNICIAN |
| ACCEPTED | CANCELLED | CUSTOMER, TECHNICIAN, ADMIN |
| EN_ROUTE | ARRIVED | TECHNICIAN |
| EN_ROUTE | CANCELLED | CUSTOMER, TECHNICIAN, ADMIN |
| ARRIVED | IN_PROGRESS | TECHNICIAN |
| ARRIVED | CANCELLED | ADMIN only (technician on site) |
| IN_PROGRESS | COMPLETED | TECHNICIAN |
| IN_PROGRESS | DISPUTED | CUSTOMER, TECHNICIAN, ADMIN |
| IN_PROGRESS | CANCELLED | ADMIN |
| COMPLETED | CUSTOMER_CONFIRMED | CUSTOMER |
| COMPLETED | DISPUTED | CUSTOMER, TECHNICIAN, ADMIN |
| CUSTOMER_CONFIRMED | PAID | SYSTEM |
| CUSTOMER_CONFIRMED | DISPUTED | CUSTOMER, TECHNICIAN, ADMIN |
| PAID | DISPUTED | CUSTOMER, TECHNICIAN, ADMIN |
| DISPUTED | CANCELLED, PAID | ADMIN |
| CANCELLED | — | terminal |

**Business rules:**

- No status is ever written directly. Every change is validated against this table **and** the actor.
- Every change appends immutable history (from, to, actor, user, note, time).
- The current status is re-read inside the transaction.
- A technician cancelling increments their `cancelledJobs`.
- Cancellation records who, when and why.
- Admin reassignment clears the technician and returns the booking to MATCHING.

**Future:** the table moves verbatim to `packages/shared/src/bookings/state-machine.ts`.

- **Server:** the `transitionBooking(tx, bookingId, to, actor, extra)` helper in Functions is the only code that writes `bookings.status`. Rules deny all client writes to `bookings`.
- **Client:** `getValidNextStates(status)` filtered by the viewer's actor type decides which buttons to show, for example the technician's single "next step" button. It is never used for enforcement.

### 5.2 Booking creation and flow

- **Rule:**
  - `SCHEDULED` requires `scheduledAt`.
  - The service must be active.
  - The estimate is copied from the service range.
  - Matching can only run from REQUESTED or MATCHING.
  - Offers can only go to VERIFIED technicians.
  - Offering increments `offeredJobs`, and responding increments `respondedJobs`.
  - Confirmation locks the commission and creates the payment invoice, and it increments `completedJobs`.
- **Future:** **Server**, in callables `bookings-create`, `bookings-selectTechnician`, `bookings-respondToOffer`, `bookings-advance`, `bookings-confirmCompletion`, `bookings-cancel` and `admin-reassignBooking`. All counters are updated inside the same transaction as the transition (fixes D-8).

### 5.3 Matching

- **Rule:**
  - **Filters:** VERIFIED, online, offers the service, an availability window covers the day and time needed (`start ≤ t ≤ end`), and within `radiusKm` of at least one service area (using the nearest one).
  - **Score** = 0.30·distance + 0.25·rating + 0.15·completedJobs + 0.15·completionRate + 0.10·(1 − cancellationRate) + 0.05·responseRate, where:
    - distance score = 1 − d/15 km, clamped
    - rating score = rating/5
    - completedJobs saturates at 100
    - new technicians get a 0.5 prior on completion and response rates
  - **Order:** score desc, then distance asc, then id asc.
  - Return the top 3 and exclude technicians who declined.
- **Future:** pure `filterEligible` + `computeMatchScore` + `sortCandidates` in `packages/shared/src/matching`. **Server**: `bookings-create` / `matchBooking` queries candidates, runs the pure functions, and stores the `candidates[]` snapshot on the booking. Weights, radius and time zone come from `settings/platform`, with the current values as defaults.

### 5.4 Technician verification

- **Rule:**
  - Only admins decide.
  - Every decision is audited.
  - A decision other than VERIFIED forces the technician offline.
  - Verification history is kept.
  - Only VERIFIED technicians are matchable or offerable.
- **Future:** **Server**: `technicians-submitVerification` (owner) and `admin-reviewTechnician` (admin, audited). Rules make `verificationStatus` unwritable by clients. A technician can read their own verification records, and **no one else except admins** can.

### 5.5 Commission calculation

- **Rule:**
  - Resolution order: active TECHNICIAN rule → active SERVICE rule → newest active GLOBAL rule → platform default (15%).
  - commission = round(gross × % / 100), and net = gross − commission.
  - The percentage is snapshotted at confirmation.
- **Future:** pure `resolveCommissionPercent(rules, ctx, default)` + `splitByCommission(grossMinor, pct)` in shared, using integers so commission + net === gross always holds. **Server** only. Clients may display an *estimate* using the same function, but the persisted figures come from the server.

### 5.6 Wallet / ledger

- **Rule:**
  - Balances change only through ledger entries.
  - Entries are immutable, with a positive amount and a type that sets the direction, and they record `balanceAfter`.
  - Corrections use ADJUSTMENT entries.
  - A withdrawal moves available → pending (reserved).
  - Payout success releases pending. Payout failure reverses pending → available with a REVERSAL entry.
  - A withdrawal is refused if the amount exceeds the available balance.
- **Future:** pure `applyLedgerEntry(balances, entry)` and `reconcile(entries)` in shared. **Server** only (every wallet path is Functions-only in rules). Entry IDs are deterministic, e.g. `earning_{bookingId}`, `commission_{bookingId}`, `withdrawal_{payoutId}`, `reversal_{payoutId}`. A duplicate `create()` therefore fails instead of double-posting.

### 5.7 Payouts

- **Rule:** request → PENDING → (PROCESSING) → COMPLETED or FAILED. Failure reverses the reservation. Methods are MTN MoMo, Telecel Cash and AirtelTigo Money.
- **Future:** **Server**: `wallet-requestPayout` (technician), `admin-processPayout` (admin, audited, `transferToTechnician` through the provider abstraction), and a provider callback webhook. There is an explicit payout state machine, so COMPLETED and FAILED are final (fixes D-3). Settings control the minimum amount and "one open payout at a time".

### 5.8 Payments

- **Rule:**
  - One payment invoice per booking.
  - Attempts are logged separately.
  - A booking can't be paid twice.
  - Only SYSTEM marks a booking PAID, and PAID credits the technician in the same atomic step.
  - The provider is chosen only in the factory.
- **Future:** **Server** only (see §14). The client never reports success. It watches `payments/{bookingId}` for the server-set status.

### 5.9 Ratings

- **Rule:** the booking's customer only, after CUSTOMER_CONFIRMED or PAID, a 1–5 integer, one per booking, an optional comment, and the technician average is updated.
- **Future:** **Server** callable `ratings-submit`. The deterministic doc ID `ratings/{bookingId}` enforces one per booking. The technician's `ratingSum` and `ratingCount` are updated in the same transaction.

### 5.10 Disputes

- **Rule (from the model and the state machine):** either party can raise a dispute from IN_PROGRESS onwards. Admins resolve it to CANCELLED (void, with an optional refund) or PAID (released).
- **Future:** **Server** callables `disputes-open`, `disputes-respond` and `admin-resolveDispute`. Resolution writes refund and ledger adjustments and an audit entry.

### 5.11 Notifications

- **Rule (spec events):** new booking, technician assigned, accepted, en route, arrived, job started, completed, payment received, payout completed, dispute opened, verification approved or rejected.
- **Future:** **Server**. Domain services write outbox records inside their transactions, and a trigger dispatches them (§16).

### 5.12 WhatsApp booking flow

- **Rule:** START → SELECT_SERVICE (DB-driven menu) → DESCRIBE_PROBLEM (text required) → LOCATION (a WhatsApp location pin is required) → TIME (ASAP, Today, Tomorrow, or custom `DD/MM HH:mm`, which rolls into next year if the date has passed) → booking created, matching runs and up to 3 candidates are shown → SELECT_TECHNICIAN → OFFERED → BOOKING_CREATED. Any message in a terminal state restarts the flow. A handler error sends an apology and keeps the state.
- **Future:** **Server**. The handlers call the **same domain services** as the callables (§13).

### 5.13 Authorisation and admin actions

- **Rule:**
  - Identity comes only from a verified token.
  - Role gate plus ownership checks.
  - Customers act only on their own bookings.
  - Technicians act only on jobs offered or assigned to them.
  - Admin-only operations are audited.
- **Future:** **Server + Rules.** Claims (`tech`, `admin`), ownership assertions in every callable, deny-by-default rules, and an `adminActions` write for every privileged callable.

### 5.14 Defects in the current logic (fix during the port, don't preserve)

| ID | Severity | Defect | Location | Fix |
| --- | --- | --- | --- | --- |
| D-1 | **High (security)** | `cancel` derives the actor from the caller's role but **never checks ownership**. Any customer (or technician) can cancel any booking whose status permits it | `bookings.controller.cancel` → `cancelBooking` | Ownership assertion: customer = booking owner, technician = assigned technician |
| D-2 | **High (money)** | The **customer supplies `finalPrice`** on confirm, so the payer sets the amount | `confirmJobCompletion` | Price authority rule (Decision D4) |
| D-3 | **High (money)** | `completePayout` and `failPayout` don't check the payout's status. Calling fail twice reverses twice, and completing a failed payout makes pending negative | `wallet.service` | Payout state machine + deterministic reversal ID |
| D-4 | **High (integrity)** | WhatsApp webhook retries aren't deduplicated, so a Meta retry can create duplicate bookings | `whatsapp.controller` | Dedupe on the WhatsApp message ID (§13) |
| D-5 | Medium (security) | `pay` has no ownership check, and the payer's phone comes from the request body | `bookings.controller.pay` | Owner check; phone from the profile, or validated |
| D-6 | Medium | A customer can offer a job to **any** VERIFIED technician, even one not matched, not offering the service, or offline | `offerBookingToTechnician` | Must be in the booking's server-stored `candidates` |
| D-7 | Medium | Webhook processing continues after the HTTP response. On Cloud Functions, work after the response isn't guaranteed | `whatsapp.controller` | Persist, then 200, then trigger-driven processing |
| D-8 | Medium | `respondedJobs` and `offeredJobs` are incremented outside the transition transaction, and before validation | `bookings.service` | Counters inside the transaction |
| D-9 | Medium | `submitVerification` sets PENDING unconditionally, so a SUSPENDED or VERIFIED technician resets themselves to PENDING | `technicians.service` | Only allowed from PENDING, REJECTED or unsubmitted |
| D-10 | Medium | There is no way to suspend a *user* (`UserStatus`). Suspending a technician only affects matching, and they can still sign in | — | `admin-suspendUser` + Auth disable + token revoke |
| D-11 | Medium | The customer is told "✅ Booking confirmed!" when the job is only OFFERED | `handleSelectTechnician` | Accurate copy + a follow-up on accept or decline |
| D-12 | Medium | No offer timeout. A booking with no match stays in MATCHING forever | — | Scheduled expiry (SYSTEM actor) |
| D-13 | Low | A WhatsApp message from a technician's phone attaches a customer profile to a TECHNICIAN user | `resolveCustomerIdentity` | Capability model (everyone can be a customer) |
| D-14 | Low | Availability uses server-local time and is only correct because Ghana and the server are both UTC+0 | `resolveNeededAt` | `settings/platform.timezone` |
| D-15 | Low | Media and verification "uploads" are arbitrary client-supplied URLs | technicians controller | Storage paths written under rules and validated server-side |
| D-16 | Low | The OTP uses `Math.random`, and OTP requests create users for any phone number | `otp.service` / `auth.service` | Replaced by Firebase Auth; a crypto RNG if custom OTP is used |
| D-17 | Low | Typecheck error | `ratings.service.ts:14` | Fixed in Stage 2 so the legacy code stays green |

Also noted:

- Technicians can't `GET /bookings/:id` (only admins and customers can), so they rely on the jobs list.
- In mock mode the WhatsApp webhook accepts unsigned requests. That is acceptable in development only, and must never be deployed.

---

## 6. Future architecture

```text
   React Web (Vite)          React Native (Expo)          WhatsApp (Meta)
  customer · tech · admin       technician-first            customers
          │                          │                          │
          │  Firebase Auth (ID token + claims), App Check        │ HTTPS webhook
          │                          │                          ▼
          ├── reads: Firestore real-time listeners ──┐   ┌─────────────────────┐
          │   (Security Rules enforce who sees what) │   │ webhooks-whatsapp   │
          │                                          │   │ (verify HMAC, dedupe│
          └── writes: httpsCallable(...) ─────────┐  │   │  → whatsappInbound) │
                                                  ▼  │   └──────────┬──────────┘
                  ┌───────────────────────────────────────────────────────────┐
                  │  Cloud Functions (v2, Node, TypeScript)                   │
                  │  adapters: callables · HTTP webhooks · triggers · cron    │
                  │                    │                                      │
                  │     domain services (bookings, matching, payments,        │
                  │     wallet, verification, disputes, notifications)        │
                  │                    │ uses                                 │
                  │     @serviceflow/shared  (state machine, matching,        │
                  │     commission, ledger, money, phone, geo — pure TS)      │
                  │                    │                                      │
                  │     integrations: PaymentProvider · WhatsAppProvider ·    │
                  │     OtpSender · PushSender (mock + real implementations)  │
                  └───────────────┬──────────────────────┬────────────────────┘
                                  │ Admin SDK            │
                        ┌─────────▼────────┐    ┌───────▼────────┐    ┌─────────┐
                        │    Firestore     │    │    Storage     │    │   FCM   │
                        └──────────────────┘    └────────────────┘    └─────────┘
```

### How the parts communicate

1. **Reads:** clients subscribe directly to Firestore documents and queries they are allowed to see: own bookings, the assigned job, own wallet, notifications. Changes appear on every device in real time. A technician accepting on mobile updates the customer's web view without polling.
2. **Writes:**
   - Anything that changes state, money, eligibility or another user's data goes through a **callable Function**.
   - Clients write directly only to a small set of self-owned, non-sensitive fields: display name, own device tokens, notification `readAt`, the technician's own bio and photo, and the online toggle. Rules validate the exact fields.
3. **One code path:** callables, WhatsApp handlers, scheduled jobs and admin actions all call the **same domain service functions** with an `Actor { uid, kind: CUSTOMER|TECHNICIAN|ADMIN|SYSTEM, source: WEB|MOBILE|WHATSAPP|SYSTEM }`. There is no second booking system.
4. **Side effects:** domain services write an outbox record in the same transaction. Triggers fan out notifications, so a failed push never rolls back a booking.
5. **Files:** clients upload directly to Storage paths that rules restrict to their ownership. A callable then records the metadata, validating path, type and size.
6. **Secrets:** provider keys live in Secret Manager (`defineSecret`), only in Functions. Clients hold only the public Firebase config.

---

## 7. Proposed repository structure

```text
serviceFlow/
├── apps/
│   ├── web/                    React + Vite + TS + React Router + Tailwind
│   ├── mobile/                 Expo + Expo Router + TS (technician-first)
│   ├── functions/              Cloud Functions v2 — the trusted backend
│   │   └── src/
│   │       ├── adapters/       callables/, http/ (webhooks), triggers/, scheduled/
│   │       ├── domains/        bookings/, matching/, technicians/, payments/, wallet/,
│   │       │                   ratings/, disputes/, notifications/, whatsapp/, admin/
│   │       ├── integrations/   payments/ (interface, mock, paystack…), whatsapp/, otp/, push/
│   │       ├── lib/            firestore helpers, auth guards, audit, errors→HttpsError, config
│   │       └── scripts/        seed.ts, bootstrap-admin.ts
│   └── backend/                LEGACY Express API — frozen, deleted domain by domain
├── packages/
│   ├── shared/                 @serviceflow/shared — domain types, const enums, zod schemas,
│   │                           and PURE rules: state machine, matching, commission, ledger,
│   │                           money, phone, geo, errors, design tokens
│   ├── firebase/               @serviceflow/firebase — SDK-agnostic contract: collection
│   │                           paths, callable names + request/response types, doc
│   │                           (de)serialisers using a structural TimestampLike type
│   └── database/               LEGACY Prisma — deleted with apps/backend
├── firebase/
│   ├── firestore.rules
│   ├── firestore.indexes.json
│   ├── storage.rules
│   └── tests/                  rules tests (@firebase/rules-unit-testing)
├── firebase.json               emulators, functions source, hosting (apps/web/dist), rules paths
├── .firebaserc                 project aliases (demo-serviceflow for local; real IDs later)
├── docs/                       ARCHITECTURE.md, LEGACY_REMOVAL.md, runbooks
└── SERVICEFLOW_MIGRATION_PLAN.md
```

### Why this shape and not the suggested one

- **`types` is merged into `shared`.**
  - Types, zod schemas and the rules that use them change together.
  - Every consumer that wants the types also wants the rules.
  - A separate package would add a boundary and a version to keep in step, without a consumer that needs types alone.
  - Tree-shaking keeps unused logic out of client bundles.
  - `shared` stays **pure**: no Firebase, React or Node-only imports, so it runs in all three runtimes and tests in milliseconds.
- **`firebase` is a contract package, not an SDK wrapper.**
  - Web uses the Firebase JS SDK, and mobile will likely use React Native Firebase (D1). They have different SDKs, but the **callable names, payload types, collection paths and document shapes** must be identical.
  - This package holds exactly that, which makes it impossible for web and mobile to drift.
  - Each app has a thin `lib/firebase.ts` that initialises its SDK and uses the contract.
- **There is no `packages/ui`.**
  - DOM + Tailwind and React Native share no components worth abstracting.
  - Shared **design tokens** (colour, spacing, type scale, radii) live in `shared/design-tokens.ts`.
- **Functions are split into `adapters/` and `domains/`.**
  - This preserves the good layering in the current backend (controller → service).
  - It is what lets WhatsApp, callables and cron share one domain layer.
- **Legacy stays in place.**
  - `apps/backend` and `packages/database` remain, frozen and green, until the Firebase replacement for each domain works (rule: migrate, then delete).
  - `docs/LEGACY_REMOVAL.md` tracks this per domain.
- **Internal packages are source-only** (`main: src/index.ts`, as today). Vite, Metro and the Functions bundler (esbuild) each compile them, so there is no build ordering between packages.

**Dependency direction** (enforced through `package.json`, plus a lint rule later):

`shared` ← `firebase` ← `web`, `mobile`, `functions`. Apps never import each other.

---

## 8. Firestore data model

### 8.1 Conventions

- **IDs:**
  - The Auth `uid` keys `users`, `customers`, `technicians` and `wallets`.
  - **Deterministic IDs** enforce the uniqueness Postgres used to give us: `payments/{bookingId}`, `ratings/{bookingId}`, `conversations/{e164}`, `whatsappInbound/{wamid}`, `paymentWebhookEvents/{provider}_{eventId}`, and ledger entry IDs (§15).
  - Everything else uses auto IDs.
- **Money:** integer **pesewas** (`…Minor` fields) + `currency: "GHS"`. Firestore has no decimal type, and floats would corrupt a ledger.
- **Time:** Firestore `Timestamp`. Server times use `serverTimestamp()`. Business time zone is `settings/platform.timezone` (`Africa/Accra`).
- **Denormalisation:** only display snapshots that must survive edits (service name, technician name and photo on a booking) and fields needed for rules or queries (`customerId`, `technicianId`). Permissions are never denormalised.
- **Soft delete:** `deletedAt` on bookings, payments, disputes and users. These are never hard-deleted.
- **Private vs public:** rules can't hide individual fields, so private data lives in **separate docs** (for example, a technician's phone is in `users`, not `technicians`).
- **Relational → document:**
  - A 1:1 relation becomes a shared ID.
  - A small bounded 1:N relation becomes an embedded array.
  - An unbounded 1:N relation owned by a parent becomes a subcollection.
  - A relation queried across parents becomes a top-level collection, or a subcollection with collection-group queries.

### 8.2 Collections

**Legend:** **F** = written only by Cloud Functions (clients have no write access in rules). **C** = client write allowed, limited to the listed fields and validated by rules.

#### Identity

| Path | Purpose | Main fields | Relationships | Read | Write |
| --- | --- | --- | --- | --- | --- |
| `users/{uid}` | Account record (private) | phone (E.164), email?, displayName, status (ACTIVE/SUSPENDED), capabilities mirror {tech, admin}, createdAt, lastLoginAt | 1:1 Auth user; parent of devices and notifications | owner, admin | **F**; owner may edit `displayName` (**C**) |
| `users/{uid}/devices/{deviceId}` | Push targets | fcmToken, platform, appVersion, lastSeenAt | owner | owner | owner (**C**) |
| `users/{uid}/notifications/{id}` | In-app inbox | type, title, body, data {bookingId…}, readAt?, createdAt | owner | owner | **F**; owner may set `readAt` (**C**) |
| `customers/{uid}` | Customer profile | fullName, defaultLocation {label, lat, lng, geohash, areaId?}, savedAddresses[] (≤10) | 1:1 user | owner, admin; the assigned technician gets name only via the booking snapshot | owner (**C**, validated fields) |
| `technicians/{uid}` | Technician **public** profile + matching data | displayName, photoPath, bio, yearsExperience, serviceIds[], skills[] {serviceId, years}, serviceAreas[] {areaId?, name, lat, lng, radiusKm} (≤10), weeklyAvailability[] {day, start, end} (≤14), isOnline, verificationStatus, stats {ratingSum, ratingCount, avgRating, completed, cancelled, offered, responded}, activeBookingId?, searchKeywords[] | 1:1 user; referenced by bookings, ratings, payouts | any signed-in user | owner **C**: `displayName, bio, photoPath, yearsExperience, weeklyAvailability, isOnline` (isOnline only when VERIFIED). Everything else **F** (serviceIds and areas via callable, for validation) |
| `technicianVerifications/{id}` | Verification submissions + review history | technicianId, idType (GHANA_CARD, PASSPORT, DRIVERS_LICENSE, VOTER_ID), idNumber, idPhotoPath, selfiePath?, status, reviewNotes?, reviewedBy?, submittedAt, reviewedAt? | N:1 technician | owner, admin | **F** |

#### Catalogue and settings

| Path | Purpose | Main fields | Read | Write |
| --- | --- | --- | --- | --- |
| `services/{id}` | Service catalogue | name, slug, description, iconPath, priceRange {minMinor, maxMinor}, isActive, sortOrder | public (active); admin (all) | **F** (admin callable, audited) |
| `serviceAreas/{id}` | Area catalogue for pickers and analytics | name, city, region, country, center {lat, lng}, defaultRadiusKm, isActive | public | **F** (admin) |
| `commissionRules/{id}` | Commission configuration | scope (GLOBAL, SERVICE, TECHNICIAN), serviceId?, technicianId?, percent, isActive, createdBy | admin | **F** (admin, audited) |
| `settings/platform` | Platform config | defaultCommissionPercent, currency, country, timezone, offerTimeoutMinutes, matchingExpiryMinutes, matchRadiusKm, matchWeights, minPayoutMinor, supportPhone | signed-in (non-sensitive only) | **F** (admin, audited) |
| `settings/flags` | Feature flags (no secrets ever stored in Firestore) (e.g. `paymentsEnabled`, `cashAllowed`) | booleans | signed-in | **F** (admin) |

#### Bookings

| Path | Purpose | Main fields | Relationships | Read | Write |
| --- | --- | --- | --- | --- | --- |
| `bookings/{id}` | The job | customerId, technicianId?, offeredTechnicianId?, serviceId, serviceSnapshot {name}, technicianSnapshot {displayName, photoPath}, status, problemDescription, location {lat, lng, geohash, address?, areaId?}, preferredTime (ASAP, TODAY, TOMORROW, SCHEDULED), scheduledAt?, pricing {estimateMinMinor, estimateMaxMinor, quotedMinor?, finalMinor?, commissionPercentSnapshot?}, candidates[] {technicianId, score, distanceKm, snapshot} (≤3), declinedTechnicianIds[], offerExpiresAt?, source, stage timestamps {requestedAt, acceptedAt, enRouteAt, arrivedAt, startedAt, completedAt, confirmedAt, paidAt}, cancellation? {byUid, actor, reason, at}, participantIds[], createdAt, updatedAt, deletedAt? | N:1 customer, technician, service; 1:1 payment and rating | customer owner; offered or assigned technician; admin | **F** |
| `bookings/{id}/statusHistory/{autoId}` | Immutable transition log (was `BookingStatusHistory`) | from?, to, actor, byUid?, note?, createdAt | child of booking | same as parent | **F** (append-only) |
| `bookings/{id}/private/contact` | Customer contact and precise directions | customerPhone, directions? | child | customer, admin, the assigned technician **only when status ≥ ACCEPTED** | **F** |
| `bookings/{id}/media/{id}` | Problem, before and after photos (was `Media`) | kind (PROBLEM, BEFORE, AFTER), storagePath, contentType, sizeBytes, uploadedBy, createdAt | child | participants, admin | uploader **C** (kind and path validated) or **F** |
| `bookings/{id}/messages/{id}` | In-app booking chat (was `Message`) | senderId, body, mediaPath?, channel (IN_APP, WHATSAPP), createdAt | child | participants, admin | participants **C** (sender = self, only while booking is active) |

#### Money

| Path | Purpose | Main fields | Read | Write |
| --- | --- | --- | --- | --- |
| `payments/{bookingId}` | Invoice, one per booking | customerId, technicianId, amountMinor, commissionMinor, technicianNetMinor, currency, method?, status (PENDING, SUCCEEDED, FAILED, REFUNDED, PARTIALLY_REFUNDED), provider?, providerReference?, refundedMinor, createdAt, paidAt? | customer owner, admin (the technician sees net amounts via the wallet ledger) | **F** |
| `payments/{bookingId}/transactions/{id}` | Provider attempt log (was `PaymentTransaction`) | kind (INITIATE, VERIFY, WEBHOOK, REFUND), provider, reference, method, status, rawRedacted, at | admin | **F** |
| `paymentWebhookEvents/{provider_eventId}` | Webhook dedupe and audit | receivedAt, processedAt?, outcome, reference | admin | **F** |
| `wallets/{uid}` | Cached balances (derived) | availableMinor, pendingPayoutMinor, lifetimeEarningsMinor, currency, lastEntryId, entryCount, updatedAt | owner, admin | **F** |
| `wallets/{uid}/transactions/{entryId}` | **Immutable ledger** (was `WalletTransaction`) | type, amountMinor (>0), balanceAfter {available, pending}, bookingId?, payoutId?, description, createdBy (SYSTEM or admin uid), createdAt | owner, admin | **F** (create-only) |
| `payouts/{id}` | Withdrawal requests | technicianId, amountMinor, method (MTN_MOMO, TELECEL_CASH, AT_MONEY), destination {msisdn, accountName}, status (PENDING, PROCESSING, COMPLETED, FAILED), providerReference?, failureReason?, requestedAt, processedAt?, processedBy? | owner, admin | **F** |

#### Trust

| Path | Purpose | Main fields | Read | Write |
| --- | --- | --- | --- | --- |
| `ratings/{bookingId}` | Rating + review (was `Rating` + `Review`, folded 1:1) | customerId, technicianId, score, comment?, customerFirstName (display), createdAt | any signed-in user (for technician profiles) | **F** |
| `disputes/{id}` | Disputes | bookingId, raisedBy (CUSTOMER, TECHNICIAN), raisedByUid, customerId, technicianId, description, technicianResponse?, evidencePaths[], status, resolution? {outcome, notes, refundMinor}, resolvedBy?, createdAt, resolvedAt? | participants, admin | **F** |

#### Operations

| Path | Purpose | Main fields | Read | Write |
| --- | --- | --- | --- | --- |
| `notificationOutbox/{id}` | Transactional outbox | eventType, recipients[] {uid?, phone?}, channels[], payload, status, attempts, nextAttemptAt, createdAt | admin | **F** |
| `conversations/{e164}` | WhatsApp conversation state | state, context {serviceId, problemDescription, location, preferredTime, scheduledAt, bookingId, candidates…}, userId, lastInboundAt, lastProcessedWamid | admin | **F** |
| `whatsappInbound/{wamid}` | Inbound queue + dedupe | from, type, text?, location?, interactiveId?, mediaId?, timestamp, receivedAt, processedAt?, error? | none | **F** |
| `adminActions/{id}` | Immutable audit log | adminUid, actionType, targetType, targetId, before?, after?, reason?, requestId, createdAt | admin | **F** (create-only) |
| `rateLimits/{key}` | Abuse control counters | count, windowStart | none | **F** |
| `reports/daily/{yyyy-mm-dd}` | Pre-aggregated metrics | bookings by status, GMV, commission, new technicians… | admin | **F** (scheduled) |

**Dropped or folded:**

- `OtpCode` is dropped (Auth).
- `Review` is folded into `ratings` (strict 1:1).
- `TechnicianService`, `ServiceArea` and `Availability` become arrays on `technicians/{uid}` (small, bounded, and needed together by matching).
- The top-level `Media`, `Message` and `Notification` become subcollections of their owner (simpler rules and queries).
- `BookingStatusHistory` becomes a subcollection. Admins query across bookings with a collection-group query.
- `Commission` is renamed to `commissionRules` for clarity.

### 8.3 Matching query shape

`technicians` where `verificationStatus == "VERIFIED"` and `isOnline == true` and `serviceIds array-contains serviceId`, followed by pure `filterEligible` (area radius + availability in `Africa/Accra`) and `computeMatchScore`.

This is adequate up to a few thousand online technicians per service. After that, a `geohashes[]` field per service area and a geohash pre-filter (`geofire-common`) are added **without changing the scoring code**.

### 8.4 Required indexes (initial `firestore.indexes.json`)

| Collection | Fields | Used by |
| --- | --- | --- |
| bookings | customerId ↑, createdAt ↓ | customer booking history |
| bookings | technicianId ↑, status ↑, createdAt ↓ | technician job tabs |
| bookings | offeredTechnicianId ↑, status ↑ | technician "new requests" |
| bookings | status ↑, createdAt ↓ | admin booking lists and monitors |
| bookings | status ↑, offerExpiresAt ↑ | offer-expiry scheduler |
| bookings | serviceId ↑, status ↑, createdAt ↓ | admin filters |
| technicians | verificationStatus ↑, isOnline ↑, serviceIds (array-contains) | matching |
| technicians | verificationStatus ↑, createdAt ↓ | admin technician list |
| technicians | searchKeywords (array-contains), createdAt ↓ | admin search |
| technicianVerifications | status ↑, submittedAt ↑ | verification queue |
| technicianVerifications | technicianId ↑, submittedAt ↓ | history |
| payouts | technicianId ↑, requestedAt ↓ | technician payout history |
| payouts | status ↑, requestedAt ↑ | admin payout queue |
| payments | status ↑, createdAt ↓ | admin payments, reconciliation |
| disputes | status ↑, createdAt ↓ | admin disputes |
| ratings | technicianId ↑, createdAt ↓ | technician reviews |
| adminActions | targetType ↑, targetId ↑, createdAt ↓ | audit per entity |
| adminActions | adminUid ↑, createdAt ↓ | audit per admin |
| notificationOutbox | status ↑, nextAttemptAt ↑ | dispatcher retries |
| collection group `statusHistory` | createdAt ↓ | admin activity feed |
| collection group `transactions` (wallets) | createdAt ↓ | admin ledger views |

### 8.5 Storage layout

```text
technicians/{uid}/profile/{file}              owner write (image/*, ≤5 MB) · signed-in read
technicians/{uid}/portfolio/{file}            owner write (image/*, ≤5 MB) · signed-in read
verifications/{uid}/{submissionId}/{file}     owner create-only (image/*, ≤8 MB) · owner + admin read · NEVER public
bookings/{bookingId}/{kind}/{file}            participants write (image/*, ≤8 MB) · participants + admin read
disputes/{disputeId}/{file}                   dispute parties write · parties + admin read
```

Storage rules check booking participation with `firestore.get()`. Clients compress images before upload (longest side 1280 px, JPEG quality around 0.7), because technicians are on limited data.

---

## 9. Authentication architecture

### 9.1 Approach

| User | Method | Notes |
| --- | --- | --- |
| Customer | Phone OTP (web; mobile later) | Also identified implicitly by WhatsApp number (see account creation) |
| Technician | Phone OTP (mobile and web) | Phone-first. There is no separate sign-up form before the OTP |
| Admin | Email + password, with **MFA (TOTP)** required in production | Admins can't self-register. They are created by a bootstrap script or by an existing admin through an audited callable |

**Phone OTP mechanism (Decision D2):**

- **(a) Firebase Phone Auth:**
  - Web: `signInWithPhoneNumber` + reCAPTCHA.
  - Mobile: native verification with React Native Firebase.
  - Google handles the SMS, including pricing and delivery quality to Ghanaian networks.
- **(b) Custom OTP → custom token:**
  - A `auth-requestOtp` Function sends a code through an `OtpSender` (mock, local SMS aggregator such as Hubtel/Arkesel/mNotify, **or WhatsApp**).
  - `auth-verifyOtp` checks it (hashed, 5-minute TTL, 5 attempts: the existing tested logic) and returns `createCustomToken(uid)`.
  - The client calls `signInWithCustomToken`.
  - The flow is identical on every client, there is no reCAPTCHA, there is a WhatsApp fallback, and local SMS pricing applies.
  - The trade-off: we own abuse protection (App Check + per-phone and per-IP limits in `rateLimits`).

**Recommendation: (b).** It preserves the existing OTP rules and lets customers who live in WhatsApp get codes there. Either way, the `uid` stays stable per phone number.

### 9.2 User document structure

`users/{uid}` (private), `customers/{uid}` (profile), and `technicians/{uid}` (public profile) + `technicianVerifications` (private). See §8.2.

### 9.3 Role management: capability claims

```ts
// Custom claims — set ONLY by Functions via the Admin SDK
{ tech?: true, admin?: true }
```

- **Every signed-in user is a customer.** This fixes the one-role-per-phone conflict (D-13).
- `tech: true` is granted by `technicians-register`. **"Technician" is not the same as "verified":** `verificationStatus` lives on the technician doc, because it changes often and claims only refresh with tokens.
- `admin: true` is granted by `scripts/bootstrap-admin.ts` or the `admin-grantAdmin` callable (admin-only, audited, requires a recent sign-in).
- After a claim changes, the server writes `users/{uid}.claimsUpdatedAt`. The client listens and calls `getIdToken(true)`.
- **Rules and Functions trust only `request.auth.token`.** The `users` mirror is for display.

### 9.4 Account creation

| Path | Flow |
| --- | --- |
| Web or mobile phone sign-in | OTP → sign-in → client calls the idempotent `account-ensureProfile`, which creates `users/{uid}` and `customers/{uid}` if missing |
| Technician onboarding | Signed-in user → `technicians-register` {name, …} → creates `technicians/{uid}` (verificationStatus = UNSUBMITTED) and `wallets/{uid}`, and sets `tech: true` |
| WhatsApp customer | The inbound handler resolves the phone: `getUserByPhoneNumber`, otherwise `createUser({ phoneNumber })`, then ensures the profile. A later web login with the same phone lands on **the same uid and booking history** |
| Admin | Bootstrap script (email + temporary password + `admin` claim), then a forced password reset and MFA enrolment |

### 9.5 Session handling

- **Web:** Firebase persistence is `browserLocalPersistence` for customer and technician areas, and `browserSessionPersistence` for the admin area, plus a 30-minute idle sign-out.
- **Mobile:** React Native Firebase native persistence (survives restarts, works offline).
- ID tokens last 1 hour and refresh automatically. Refresh tokens are long-lived until revoked.
- Sensitive admin callables (payouts, adjustments, commission, grants) require `auth_time` within 15 minutes, otherwise the client prompts for re-authentication.

### 9.6 Suspension

`admin-suspendUser`, in one callable:

1. Set `users/{uid}.status = SUSPENDED` and write an audit entry.
2. Disable the Auth user with `updateUser({ disabled: true })`.
3. Call `revokeRefreshTokens(uid)`.
4. If they are a technician, set `isOnline = false` and reassign their active offers.

Callables verify tokens with `checkRevoked: true`, and rules check `users/{uid}.status == "ACTIVE"` on writes, so the suspension takes effect immediately instead of when the token expires. Reactivation reverses these steps and is also audited.

### 9.7 Passwords

Passwords exist **for admins only**. Firebase handles hashing, so no password hash is ever stored by us.

- A password policy (length, complexity) is set in Identity Platform.
- Resets use the Firebase email reset flow.
- MFA requires upgrading the project to **Identity Platform** (a noted cost and setup item).
- The bootstrap password is single-use.

---

## 10. Security architecture

### 10.1 Principles

1. **Deny by default:** `match /{document=**} { allow read, write: if false; }`, and each collection opts in.
2. Clients never write status, money, stats, verification, claims mirrors, commission or audit data. Those paths are **Functions-only**.
3. Private data lives in separate docs, because rules can't hide individual fields.
4. Every client write is validated: which keys changed (`diff().affectedKeys().hasOnly([...])`), types, sizes and ownership.
5. Each callable repeats the checks: token → claims → ownership → state machine → zod input.
6. App Check is enforced on callables, Firestore and Storage in production.

### 10.2 Access matrix

| Resource | Customer | Technician | Admin | Functions |
| --- | --- | --- | --- | --- |
| Own `users` doc | read; edit displayName | read; edit displayName | read all | full |
| Others' `users` | ✗ | ✗ | read | full |
| Own `customers` doc | read/write (validated) | (as customer) | read all | full |
| `technicians/*` | read | read all; edit **own** allow-listed fields | read all | full |
| `technicians.verificationStatus`, `stats`, `serviceIds`, `serviceAreas` | ✗ | ✗ (callable only) | via callable | full |
| `technicianVerifications` | ✗ | read own; submit via callable | read; review via callable | full |
| `services`, `serviceAreas` | read active | read active | read all; edit via callable | full |
| `bookings` | read own; create, cancel, confirm, select technician **via callable** | read offered or assigned; accept, decline, advance **via callable** | read all; reassign or cancel via callable | full |
| `bookings/*/private/contact` | read own | read when assigned **and** status ≥ ACCEPTED | read | full |
| `bookings/*/media`, `messages` | read/write own booking | read/write assigned booking | read | full |
| `payments` | read own booking's invoice; initiate via callable | ✗ (sees net amount in ledger) | read; refund via callable | full |
| `wallets`, `wallets/*/transactions` | ✗ | **read own only** | read all; adjust via callable | full |
| `payouts` | ✗ | read own; request via callable | read all; process via callable | full |
| `ratings` | read; create own via callable | read (own reviews) | read | full |
| `disputes` | read own; open via callable | read own; open or respond via callable | read; resolve via callable | full |
| `commissionRules`, `settings` (sensitive) | ✗ | ✗ | read; edit via callable | full |
| `adminActions` | ✗ | ✗ | **read only** (immutable) | create only |
| `conversations`, `whatsappInbound`, `notificationOutbox`, `rateLimits`, `paymentWebhookEvents` | ✗ | ✗ | read (some) | full |

### 10.3 Rules sketch

```text
function signedIn()  { return request.auth != null; }
function isAdmin()   { return signedIn() && request.auth.token.admin == true; }
function isTech()    { return signedIn() && request.auth.token.tech == true; }
function isSelf(uid) { return signedIn() && request.auth.uid == uid; }
function active()    { return get(/databases/$(database)/documents/users/$(request.auth.uid)).data.status == "ACTIVE"; }
function only(keys)  { return request.resource.data.diff(resource.data).affectedKeys().hasOnly(keys); }

match /bookings/{id} {
  allow read: if isAdmin()
    || resource.data.customerId == request.auth.uid
    || resource.data.technicianId == request.auth.uid
    || resource.data.offeredTechnicianId == request.auth.uid;
  allow write: if false;                                   // callables only
  match /statusHistory/{h} { allow read: if isAdmin() || isParticipant(id); allow write: if false; }
}
match /wallets/{uid} {
  allow read: if isSelf(uid) || isAdmin();
  allow write: if false;
  match /transactions/{t} { allow read: if isSelf(uid) || isAdmin(); allow write: if false; }
}
match /technicians/{uid} {
  allow read: if signedIn();
  allow update: if isSelf(uid) && isTech() && active()
    && only(["displayName","bio","photoPath","yearsExperience","weeklyAvailability","isOnline","updatedAt"])
    && (!("isOnline" in request.resource.data.diff(resource.data).affectedKeys())
        || resource.data.verificationStatus == "VERIFIED");
}
```

### 10.4 Threats explicitly covered by tests (Stage 2 onwards)

- Cross-user reads: customer A reading customer B's booking, wallet or user doc.
- Role escalation: a client writing claims mirrors, `verificationStatus`, `stats`, `admin` fields, or `status` on a booking.
- A technician reading a booking they weren't offered, or reading contact details before ACCEPTED.
- A technician setting `isOnline` while unverified.
- Any client create, update or delete on the ledger, payments, payouts or audit data.
- Unauthenticated access to anything except the public catalogue.
- Storage: uploading to another user's path, uploading non-images or oversized files, reading verification documents as a non-owner.

---

## 11. Web application architecture

### 11.1 Stack

Vite, React, TypeScript (strict), React Router (data routers with lazy route modules), Tailwind CSS, the Firebase JS SDK (modular), TanStack Query (callable mutations + cache), react-hook-form + zod (schemas from `@serviceflow/shared`).

### 11.2 Route map

```text
PUBLIC                                   (no auth; SEO-friendly, fast)
/                                        landing
/services, /services/:slug               catalogue from Firestore (public read)
/how-it-works
/become-a-provider                       → sign-in → technician onboarding
/about, /contact
/login  → /login/verify                  phone OTP
/admin/login                             email + password (+ MFA)

CUSTOMER      /app/*                     guard: signed in
/app                                     dashboard: active booking card, recent history
/app/request                             multi-step: service → problem + photos → location → time → review → matching → choose technician
/app/bookings                            tabs: active / past
/app/bookings/:id                        live status timeline, technician card, confirm, pay, rate, dispute
/app/profile

TECHNICIAN    /tech/*                    guard: token.tech
/tech/onboarding                         profile → skills → areas → availability → verification
/tech                                    dashboard: online toggle, current job, new requests, today, earnings
/tech/jobs, /tech/jobs/:id               tabs (new/upcoming/active/completed/cancelled); single next-step action
/tech/availability
/tech/earnings, /tech/wallet, /tech/payouts
/tech/reviews, /tech/profile, /tech/verification

ADMIN         /admin/*                   guard: token.admin (+ session persistence, idle timeout)
/admin                                   KPIs, live active-jobs monitor, queues (verification, payouts, disputes)
/admin/customers[/:uid]
/admin/technicians[/:uid]                profile, stats, jobs, wallet, suspend/reactivate
/admin/verification[/:id]                queue + document viewer + approve/reject
/admin/services                          CRUD + activate
/admin/bookings[/:id]                    filters, timeline, reassign, cancel
/admin/payments, /admin/payouts          lists, refund, process payout
/admin/disputes[/:id]                    review + resolve
/admin/reports                           daily rollups, export CSV
/admin/settings                          platform, commission rules, service areas, admins
/admin/audit                             adminActions log with filters
```

Guards are **UX only** (redirects and hidden navigation). Rules and callables enforce access. The admin area is a separate lazy chunk, so customers never download admin code.

### 11.3 Component architecture

```text
apps/web/src/
  app/            router.tsx, providers (Auth, Query, Toast), layouts (Public, Customer, Tech, Admin), guards
  features/
    auth/ services/ requests/ bookings/ jobs/ technicians/ verification/
    wallet/ payouts/ payments/ ratings/ disputes/ admin-*/ settings/ audit/
      each: components/  hooks/ (useBooking, useMyJobs…)  routes/  api.ts (typed callables)
  components/ui/  Button, Input, Select, Dialog, Sheet, Badge, StatusPill, Money, Phone, EmptyState,
                  ErrorState, Skeleton, DataTable, Timeline — small, owned, accessible (no heavy kit)
  lib/            firebase.ts (init, emulator connect, App Check), callable.ts (typed wrapper over
                  @serviceflow/firebase contracts), format.ts (GHS, phone, dates via shared)
```

**Conventions:**

- Every data view has loading, empty and error states.
- Forms validate with shared zod schemas, so the client and server agree.
- Real-time listeners are used for detail and active views. Admin tables use paginated queries.
- The visual direction is restrained: neutral base, one brand accent, strong typography, minimal motion, mobile-first layouts, and WCAG AA contrast.

---

## 12. Mobile application architecture

### 12.1 Stack

Expo (current SDK), Expo Router, TypeScript (strict), and **React Native Firebase** (Decision D1: native offline Firestore persistence, native FCM, App Check with Play Integrity, native phone auth). It uses **Expo development builds (EAS)**; push notifications already require these.

Other libraries:

- `expo-location` (foreground, only when en route)
- `expo-image-picker` / `expo-camera`
- `expo-image-manipulator` (compression)
- `expo-notifications` (FCM token + foreground handling)
- `@react-native-community/netinfo`
- MMKV (small persisted cache and outbox)
- FlashList

### 12.2 Navigation

```text
app/
  (auth)/phone.tsx, verify.tsx
  (onboarding)/profile.tsx, skills.tsx, areas.tsx, availability.tsx, verification.tsx, pending.tsx
  (tabs)/_layout.tsx
    index.tsx            Home: online toggle · current job · new requests · today · earnings · alerts
    jobs.tsx             tabs: New / Upcoming / Active / Done
    earnings.tsx         wallet balance, ledger, request payout, payout history
    notifications.tsx
    profile.tsx          profile, skills, areas, availability, reviews, verification status, sign out
  jobs/[id].tsx          job detail + single primary action
  jobs/[id]/complete.tsx photos + notes + finish
  payouts/request.tsx
```

### 12.3 Core workflows

| Workflow | Design |
| --- | --- |
| Registration | Phone → OTP → name → `technicians-register` |
| Verification | Ghana Card (default) or other ID: number + photo of ID + selfie, compressed and uploaded to private Storage. Then `submitVerification`. A status screen follows until review, with a push notification on the decision |
| Availability | Weekly grid (simple day toggles + start and end time), saved directly under rules. Online toggle on Home (disabled until VERIFIED) |
| Receiving jobs | High-priority FCM data message → full-screen "New request" card with service, area, distance, estimate and an **offer countdown** (`offerExpiresAt`) |
| Accept / decline | One tap each, through the callable. The button shows a pending spinner and success is shown **only after the server confirms**. Decline asks for an optional reason |
| Job detail | Problem, photos, area. Customer phone and exact location appear only after acceptance (rules-enforced) |
| Navigate | Opens Google Maps via intent (`google.navigation:q=lat,lng`). No in-app map SDK, which saves app size and data |
| En route → Arrived → Start → Complete | **One large primary button** showing the next valid step, computed by `getValidNextStates` for the TECHNICIAN actor. Location is captured once at "en route" (no background tracking) |
| Complete work | Before and after photos + notes. Upload runs from a queue; "Finish" calls `bookings-advance → COMPLETED` |
| Earnings | Balance from `wallets/{uid}` (server-derived), ledger list, today and week totals |
| Payout | Amount (≤ available, ≥ minimum), MoMo network + number (defaults to account phone), confirm → `wallet-requestPayout`. Status is watched live |

### 12.4 Low-end devices, slow and intermittent networks

- **Offline reads:** React Native Firebase persistence caches the technician's own profile, active and upcoming jobs, wallet and notifications. Listeners are scoped narrowly, never to large collections.
- **Connectivity banner:** a global offline or reconnecting indicator.
- **Writes are split into two classes:**
  - **Critical** (accept, status transitions, payout, verification submission) are online-only callables with a `requestId` for idempotent retry. They show "Waiting for connection…" and **never** show success before the server confirms.
  - **Deferrable** (job photos, notes, profile photo) go into a persisted MMKV outbox and are uploaded with retry and backoff when back online, with progress visible.
- **Form resilience:** in-progress forms (onboarding, verification, completion notes) are saved as drafts locally.
- **Data budget:**
  - image compression before upload
  - thumbnails in lists
  - no autoplay media
  - no map SDK
  - small fonts and icons
  - Hermes engine
  - a minimal dependency set
- **Performance:** FlashList for lists, memoised rows, no heavy animation, cold-start target under 3 s on a mid/low-end Android device.
- **Android-first:** tested on Android 10+ with 2–3 GB RAM. iOS builds come second.

---

## 13. WhatsApp architecture

### 13.1 Current

```text
Meta → POST /api/v1/whatsapp/webhook
     → verify X-Hub-Signature-256 (skipped for mock)
     → 200 immediately, then process in-process (after the response)
     → provider.receiveWebhook(payload) → InboundWhatsAppMessage[]
     → conversation.service.handleInboundMessage:
         normalise phone → upsert User(CUSTOMER) + CustomerProfile
         → upsert Conversation(phone) → STATE_HANDLERS[state](...)
         → handlers call bookingsService.createBookingRequest / matchTechniciansForBooking / offerBookingToTechnician
         → persist {nextState, context}
```

**Strengths to keep:**

- the provider interface (mock and Meta)
- HMAC verification on the raw body
- explicit per-state handlers
- the **booking service is reused**, not duplicated

**Gaps:** D-4, D-7, D-11, D-12, D-13. There is also no message ordering guarantee, no status-update messages back to the customer, and no media handling.

### 13.2 Future (Firebase)

```text
Meta ──► webhooks-whatsapp (HTTP Function)
          1. verify HMAC over req.rawBody (Meta app secret from Secret Manager)
          2. normalise → for each message: create whatsappInbound/{wamid}
             (create() fails if it exists → Meta retries are dropped)
          3. respond 200 (fast, no business logic)
                     │
whatsappInbound.onCreate (trigger)
          4. transaction on conversations/{phone}: ignore if the message is older
             than lastProcessed (ordering), load state + context
          5. resolve identity (Auth user by phone; ensure customer profile)
          6. STATE_HANDLERS[state] → calls DOMAIN SERVICES with
             Actor { uid, kind: CUSTOMER, source: WHATSAPP }:
               bookings.create(...) · matching.matchBooking(...) · bookings.selectTechnician(...)
               — the SAME functions the web/mobile callables call
          7. persist next state; send replies via WhatsAppProvider
                     │
Booking events (any source) → notificationOutbox → dispatcher →
          WhatsApp channel for customers whose source/preference is WhatsApp:
          "Kwame accepted your request", "Technician is on the way", "Job complete — confirm & pay"
```

**Rules:**

- WhatsApp has **no booking logic of its own.** Handlers only parse input, call domain services and format replies.
- A booking created on WhatsApp is an ordinary `bookings` doc (`source: "WHATSAPP"`). It shows up in the admin dashboard and the technician app like any other, and the customer can later sign in on the web with the same phone and see it.
- **Meta's 24-hour customer-service window:** status updates sent more than 24 hours after the customer's last message must use **pre-approved templates** (`WhatsAppProvider.sendTemplate`). The templates are part of the Notifications sprint.
- **Payments over WhatsApp:** the customer receives a payment link or MoMo prompt that calls the same `payments` domain service.
- The mock provider remains for local development and emulator tests. It is never deployed with signature checks disabled.

**Pure parts moved to `shared/whatsapp`:** `parseCustomTime`, menu and time text builders, and the choice parser. The copy is rebranded "Welcome to ServiceFlow".

---

## 14. Payment architecture

### 14.1 Abstraction (kept from the current code, extended)

```ts
interface PaymentProvider {
  readonly id: "mock" | "paystack" | "hubtel" | "flutterwave";
  initiatePayment(i: { paymentId; amountMinor; currency; method: "MOBILE_MONEY"|"CARD"; msisdn?; network?; email?; idempotencyKey }): Promise<{ reference; status: "PENDING"|"SUCCEEDED"|"FAILED"; authorizationUrl?; raw }>;
  verifyPayment(reference): Promise<{ reference; status; amountMinor; currency; raw }>;
  refundPayment(i: { reference; amountMinor; reason; idempotencyKey }): Promise<{ reference; status; raw }>;
  transferToTechnician(i: { payoutId; amountMinor; msisdn; network; accountName; idempotencyKey }): Promise<{ reference; status; raw }>;
  parseWebhook(rawBody: Buffer, headers): { eventId; type; reference; status } | null;   // includes signature verification
}
```

Only `integrations/payments/factory.ts` picks a provider (from config). Domain code never imports a provider SDK.

### 14.2 Flow

1. **Invoice:** at CUSTOMER_CONFIRMED, the booking domain service (inside its transaction) resolves the commission, computes the split in pesewas from the **server-held final price** (D4), and creates `payments/{bookingId}` as PENDING.
2. **Initiation:** the client calls `payments-initiate` {method, msisdn/network}, which:
   - checks ownership, and that the payment status is PENDING or FAILED
   - calls `provider.initiatePayment` with idempotency key `bookingId:attemptN`
   - logs a `transactions` entry
   - returns `authorizationUrl` or "approve the prompt on your phone"
3. **Verification:**
   - A webhook `webhooks-payments-{provider}` verifies the signature (HMAC over `req.rawBody`).
   - It dedupes by creating `paymentWebhookEvents/{provider_eventId}`.
   - It **re-verifies server-to-server** with `provider.verifyPayment(reference)`, because the webhook body is never trusted alone.
   - It checks that the amount and currency match the invoice, then finalises.
4. **Finalisation (one transaction):**
   - the payment becomes SUCCEEDED
   - the booking goes CUSTOMER_CONFIRMED → PAID via the state machine (SYSTEM actor)
   - wallet ledger entries are posted (§15)
   - an outbox event "payment received" is written

   If the payment is already SUCCEEDED, this is a no-op.
5. **Reconciliation:** a scheduled job (every 10 minutes) re-verifies PENDING payments older than N minutes, in case a webhook was lost. FAILED or expired attempts can be retried by the customer.
6. **Refunds:** only from an admin callable (usually dispute resolution).
   - `provider.refundPayment` → payment status REFUNDED or PARTIALLY_REFUNDED, with `refundedMinor`.
   - If the technician was already credited, an **ADJUSTMENT_DEBIT** proportional to the refund is posted to their ledger (policy in D5).
   - Audited.
7. **Cash:** method CASH (if `settings.cashAllowed`). The technician marks cash as collected and the customer confirms (or an admin does), then the SYSTEM finalises with no provider call. The ledger posts a commission receivable (D5).

### 14.3 Guarantees

- The client can never mark anything paid, because payments are Functions-only in rules.
- Idempotency comes from:
  - deterministic IDs (`payments/{bookingId}`, `paymentWebhookEvents/*`, ledger entry IDs)
  - state-machine checks inside the transaction
  - provider idempotency keys
- Raw provider payloads are stored **redacted** (no card data, and MSISDNs are masked).
- Secret keys are only in Secret Manager.
- **Payment timing:** kept as today (pay **after** the customer confirms completion). Upfront or escrow payment is possible later without changing the abstraction.

---

## 15. Wallet architecture

### 15.1 Principle

`wallets/{uid}/transactions` is the **source of truth**. `wallets/{uid}` holds cached totals that are only ever written in the **same transaction** as a ledger entry, by Functions. No client and no rule allows `availableMinor = 5000`.

### 15.2 Entry types and effects

| Type | Available | Pending payout | When | Entry ID (idempotency) |
| --- | --- | --- | --- | --- |
| EARNING_CREDIT | +gross (or +net, see D5) | | booking PAID | `earning_{bookingId}` |
| COMMISSION_DEBIT | −commission | | booking PAID (and cash jobs) | `commission_{bookingId}` |
| WITHDRAWAL_DEBIT | −amount | +amount | payout requested | `withdrawal_{payoutId}` |
| (payout completed) | | −amount | provider confirms (no ledger entry: the debit already happened, matching today's design) | payout status guard |
| WITHDRAWAL_REVERSAL_CREDIT | +amount | −amount | payout FAILED | `reversal_{payoutId}` |
| ADJUSTMENT_CREDIT / ADJUSTMENT_DEBIT | ±amount | | admin correction, dispute refund clawback | `adj_{adminActionId}` |

### 15.3 How Functions handle each case

- **Earnings and commission:** inside the payment-finalisation transaction:
  1. Read the wallet (create it if missing).
  2. Compute new balances with the pure `applyLedgerEntry`.
  3. `create()` the entries (a duplicate fails, so the transaction aborts and nothing is posted twice).
  4. Update the cached wallet (`lastEntryId`, `entryCount`).
- **Withdrawal (`wallet-requestPayout`):**
  1. Validate the amount against `minPayoutMinor` and `availableMinor`, and that there is no other open payout.
  2. Create `payouts/{id}` PENDING.
  3. Post WITHDRAWAL_DEBIT.
  4. Move available → pending.

  All in one transaction.
- **Payout processing (`admin-processPayout`, or automatic later):**
  1. PENDING → PROCESSING.
  2. Call `provider.transferToTechnician` (idempotency key = payoutId).
  3. The result or callback moves the payout to COMPLETED (release pending) or FAILED.
- **Failed payout:** FAILED is only allowed from PENDING or PROCESSING. Post `reversal_{payoutId}` and move pending → available. The deterministic ID makes a double reversal impossible (fixes D-3).
- **Adjustments:** admin-only, reason required, recent sign-in required, audit entry written first, and the entry ID is derived from it.
- **Negative balances:** allowed only for commission owed on cash jobs (D5). Withdrawals are blocked while the balance is negative, and future earnings net it off.
- **Reconciliation:** a nightly job recomputes balances from the ledger with `reconcile()` and compares them with the cached wallet. Any mismatch raises an admin alert and an audit entry. It **never** auto-corrects silently.

---

## 16. Notification architecture

```text
domain transaction ──writes──► notificationOutbox/{id} {eventType, recipients, channels, payload}
                                   │ onCreate trigger (+ retry scheduler)
                                   ▼
                     NotificationDispatcher (resolves preferences & channels)
          ┌──────────────┬───────────────┬──────────────────┬───────────────┐
          ▼              ▼               ▼                  ▼               ▼
   in-app inbox     PushSender       WhatsAppProvider    SmsSender        EmailSender
 users/{uid}/       (FCM → users/    (templates outside  (later)          (later)
 notifications       {uid}/devices)   24h window)
```

- **Channel interface** (`NotificationChannel.send(recipient, message)`) mirrors the existing `NotificationChannel` enum: PUSH, WHATSAPP, SMS, EMAIL, plus IN_APP.
- **Events:**

  | Event | Recipients |
  | --- | --- |
  | new job offer | technician, high priority |
  | technician assigned or accepted | customer |
  | en route | customer |
  | arrived | customer |
  | job started | customer |
  | completed (confirm and pay) | customer |
  | payment received | customer + technician |
  | payout completed or failed | technician |
  | dispute opened, updated or resolved | both parties + admin queue |
  | verification approved or rejected | technician |
  | offer expired or reassigned | customer, technician |

- **Routing:** technicians get push + in-app. Web customers get in-app + push (web push later). WhatsApp-sourced customers get WhatsApp. Admins get in-app on the dashboard and optionally email.
- **Reliability:** the outbox is written atomically with the change. The dispatcher retries with exponential backoff (up to 5 attempts, then `FAILED` for admin visibility). FCM tokens that come back invalid are pruned from `devices`. A push failure never rolls back a booking.
- **Localisation:** copy templates live in shared. English first, with the structure ready for Twi, Ga and other languages later.

---

## 17. Testing strategy

### 17.1 Existing coverage and where it goes

| Existing test (count) | Future home | Treatment |
| --- | --- | --- |
| `booking-state-machine.test` (11) | `shared/bookings` | Ported verbatim; enum source changes only |
| `matching.service.test` (8) | `shared/matching` | Ported verbatim, plus new `filterEligible` tests |
| `commission.service.test` (4) | `shared/commission` | Ported and restated in pesewas, plus precedence tests |
| `conversation-handlers.test` (5) | `shared/whatsapp` | Ported (with a time zone explicitly injected) |
| `phone.test` (12), `geo.test` (3) | `shared` | Unchanged |
| `jwt.test` (3) | — | JWT disappears. **Replaced by** Auth emulator tests: custom token / claims issuance and rejection of tampered tokens by callables |
| `auth.test` middleware (6) | `functions/lib/guards` | **Replaced by** guard unit tests (`requireAuth`, `requireClaim`, suspended user rejected) |
| `app.test` HTTP (8) | functions integration | **Replaced by** callable tests: health endpoint, non-Ghana phone rejected, unauthenticated rejected, technician → admin callable denied, customer → technician callable denied |

**Legacy tests keep running unchanged** until each domain is deleted. A legacy test is removed only in the same change that lands its replacement.

### 17.2 Test layers

| Layer | Tooling | Covers |
| --- | --- | --- |
| Pure domain unit | Vitest (`packages/shared`) | State machine (every allowed and denied pair × actor), matching, commission, ledger apply and reconcile, money rounding (split sums exactly), phone, geo, time zone |
| Security rules | `@firebase/rules-unit-testing` + Firestore/Storage emulators (Vitest) | Every row in §10.2 and every threat in §10.4, both **allowed** and **denied** cases |
| Functions integration | Vitest + Functions/Firestore/Auth emulators (callables invoked with emulator ID tokens) | Auth (OTP issue/verify, attempt caps, claims, suspension). Bookings (valid, invalid and unauthorised transitions, cancel ownership (D-1), assignment, offer restricted to candidates (D-6), offer expiry). **Concurrency**: accept vs cancel and accept vs expiry race, exactly one winner. Payments (success, failure, **duplicate webhook**, bad signature, amount mismatch, reconciliation). Wallet (earning + commission, withdrawal, double-fail reversal rejected, adjustments, reconciliation detects drift). Ratings (once, owner, state gate). WhatsApp (full "Hi → OFFERED" flow with the mock provider, duplicate wamid ignored, identity reuse) |
| Web | Vitest + React Testing Library; Playwright smoke against emulators | Guards/redirects per claim, request-service form validation, booking detail renders each status, admin verification approve flow (e2e) |
| Mobile | jest-expo + React Native Testing Library; Maestro e2e later | Next-step button per status, offline banner, outbox retry, "no false success" on failed callables, payout form limits |
| CI | GitHub Actions | typecheck, unit, rules and functions-integration on emulators (JDK installed in CI), web build, mobile compile check |

**Coverage gates:** 100% of state-machine transitions, and every Security Rules matrix row has a positive and a negative test. Money paths have integration tests for every entry type.

---

## 18. Migration risks

| # | Risk | Impact | Mitigation |
| --- | --- | --- | --- |
| R1 | **Relational → document modelling** (no joins, FKs or unique constraints) | Orphans, duplicates, N+1 reads | Deterministic IDs for uniqueness, display snapshots for joins, embedded bounded arrays, all multi-doc invariants in transactions inside Functions |
| R2 | **Transactions** (read-before-write, 500-write limit, contention retries) | Failed or retried operations | Keep transactions small (booking + history + counters + ledger ≈ ≤10 writes). All reads first. Idempotent bodies so automatic retries are safe |
| R3 | **Financial consistency** (floats, partial writes) | Wrong balances | Integer pesewas, ledger + cache in one transaction, deterministic entry IDs, nightly reconciliation with alerting, no client write paths |
| R4 | **Auth migration** (JWT → Firebase, one role → capabilities) | Lockouts, wrong permissions | No production users exist (verify with the owner, D7), so there is no data migration. Claims set only by Functions. Force token refresh on change. Revocation check for suspension |
| R5 | **Security rules mistakes** | Data leaks | Deny by default, private doc splits, rules tests for every matrix row in CI, and code review of every rules change |
| R6 | **Query and index limits** (no OR across fields without `or()`, no substring search, `array-contains` once per query) | Missing admin features | Model around queries (`participantIds`, `searchKeywords`). Indexes declared in the repo. Typesense or Algolia only if admin search outgrows prefix keywords |
| R7 | **Booking concurrency** (accept vs cancel vs expiry vs reassign) | Double states | Every transition re-reads inside the transaction and runs the state machine. Firestore serialises conflicting transactions. Race tests (§17) |
| R8 | **Payment webhooks** (retries, forgery, out of order, lost) | Double credit, fake payments | HMAC over the raw body, event dedupe docs, server re-verification, amount checks, reconciliation poller, state machine blocks re-entry |
| R9 | **Wallet integrity** | Negative or phantom balances | Explicit payout state machine (fixes D-3), withdrawal checks inside the transaction, negative balance only by the cash-commission rule, reconciliation |
| R10 | **Offline mobile behaviour** | Technicians think an action succeeded when it didn't | Critical actions are online-only callables with idempotent `requestId`. Only deferrable media and notes are queued. Clear pending and offline UI. React Native Firebase persistence for reads |
| R11 | **File storage** (unvalidated URLs today, private ID documents) | PII leaks, abuse | Storage rules by path ownership, content type and size. Verification documents never public. Metadata recorded by callable. Images compressed client-side |
| R12 | **Notifications** (lost pushes, stale tokens, WhatsApp 24-hour window) | Missed jobs | Transactional outbox + retries. In-app inbox as the source of truth. Token pruning. Approved WhatsApp templates. Offer countdown in-app |
| R13 | **Region choice is permanent** (Firestore location) | Latency for Ghana users forever | Decide before creating the real project (D3). Measure `europe-west1` against `africa-south1` from Accra |
| R14 | **Functions deploy with `workspace:*` dependencies** | Deploy fails | esbuild bundle of `apps/functions` inlining `@serviceflow/*`, and a generated deploy `package.json` |
| R15 | **Expo + pnpm monorepo** (Metro resolution, duplicate React) | Build breakage | `node-linker=hoisted`, one React version pinned at the root, Expo's monorepo Metro defaults |
| R16 | **Tooling** (pnpm 11 build approvals; no Java or Firebase CLI locally) | Can't install or emulate | Build allow-list in `pnpm-workspace.yaml`, `firebase-tools` as a dev dependency, JDK 21 prerequisite, CI image with a JDK |
| R17 | **Cost** (listeners on large admin lists, frequent crons, Identity Platform for MFA) | Surprise bills | Paginated admin queries, listeners on detail views only, daily rollups, budget alerts |
| R18 | **Legacy and new systems diverging** during migration | Double maintenance | Legacy frozen (bug fixes only, no features), per-domain removal checklist, one direction of travel |
| R19 | **Unresolved business rules** (price authority, cash commission) | Wrong money flows | Decisions D4 and D5 resolved before the Bookings and Payments stages |

---

## 19. Migration strategy

1. **Strangler, domain by domain:**
   - Build each domain on Firebase.
   - Prove it with tests (unit + rules + integration).
   - Then delete the corresponding legacy module and tests in the same change as their replacement coverage.
2. **No data migration expected:**
   - The legacy system was never deployed, and its seed data is recreated by the Firestore seed script.
   - If production data does exist (D7), a one-off export → transform → Admin SDK import script is added before the Auth stage. Phone numbers are the join key into Firebase Auth.
3. **Emulator-first:**
   - All development and CI run against the Firebase Emulator Suite with the `demo-serviceflow` project ID. It can't touch real resources.
   - A real Firebase project (dev) is created only after D3 and only when you approve it. Production follows at hardening.
4. **Freeze legacy:**
   - `apps/backend` gets no new features.
   - Its security defects (D-1, D-3, …) are fixed **in the new implementation**, not back-ported, unless you want the legacy API to be used in the meantime.
5. **Order of work (stages):**
   1. Foundation (Stage 2)
   2. Authentication
   3. Users and profiles
   4. Services
   5. Technician onboarding and verification
   6. Bookings
   7. Matching
   8. Technician mobile workflow
   9. Web dashboards
   10. Payments
   11. Wallet and payouts
   12. Notifications
   13. WhatsApp
   14. Disputes
   15. Analytics and reports
   16. Production hardening and legacy removal (App Check enforcement, MFA, backups, monitoring, budgets)
6. **Branding:** done in Stage 2 for everything that stays (packages, README, metadata, and user-visible copy in legacy code such as the WhatsApp greeting). New apps are born as ServiceFlow.

### 19.1 Branding migration checklist

Occurrences of the old name found in the audit (`grep -i "home[ -_]?service|homeservice"`):

| Area | Location | Change |
| --- | --- | --- |
| Root package | `package.json` `name: "home-service"`, description, `db:*` filters | `service-flow`, "ServiceFlow — Ghana-first services platform", filters → `@serviceflow/database` |
| Package names | `packages/shared` (`@home-service/shared`), `packages/database` (`@home-service/database`) | `@serviceflow/shared`, `@serviceflow/database` (legacy) |
| Imports | about 45 import lines across `apps/backend/src/**` | Mechanical rename to `@serviceflow/*` |
| Test config | `apps/backend/vitest.config.ts` aliases + test `DATABASE_URL` (`homeservice`) | Aliases → `@serviceflow/*`; DB name → `serviceflow_test` |
| Backend dependencies | `apps/backend/package.json` | `@serviceflow/*` |
| README | Title, tagline, commands (`@home-service/shared`) | Rewritten for ServiceFlow and the new architecture |
| **User-visible copy** | `conversation-handlers.ts:25` "👋 Welcome to Home Service." | "👋 Welcome to ServiceFlow." |
| Logs and health | `server.ts:8` "Home Service backend…"; `app.ts:34` `service: "home-service-backend"` | "ServiceFlow legacy API" / `serviceflow-legacy-api` |
| Seed | `seed.ts:8` "Seeding Home Service…"; `seed.ts:58` default `admin@homeservice.gh` | ServiceFlow; admin email from env (domain D6) |
| Schema comment | `schema.prisma:1` | "ServiceFlow (legacy) — Prisma schema" |
| Env example | `.env.example` DB user and name `homeservice`, `ADMIN_BOOTSTRAP_EMAIL=admin@homeservice.gh` | `serviceflow`; `admin@<domain>` |
| New: web | `index.html` `<title>`, meta description, Open Graph, favicon, manifest | ServiceFlow |
| New: mobile | `app.json`/`app.config.ts`: name "ServiceFlow", slug `service-flow`, scheme `serviceflow`, Android package / iOS bundle ID (D6), icon, splash | ServiceFlow |
| New: Firebase | project ID (e.g. `serviceflow-dev`, `serviceflow-prod`), `.firebaserc` aliases, Functions `service` labels | ServiceFlow |
| Env var prefixes | New apps use `VITE_FIREBASE_*`, `EXPO_PUBLIC_FIREBASE_*`; Functions use `PAYMENT_*`, `WHATSAPP_*`, `OTP_*` | No brand in variable names, so nothing to rename later |
| **Not renamed** | Firestore collection names, the `ConversationState` values, enum values | Unaffected by branding, by design |

---

## 20. Stage 2 implementation plan: Foundation

**Goal:** a working ServiceFlow monorepo in which web, mobile, functions and shared packages all install, typecheck, test and build. Firebase runs **only on local emulators**. The existing business rules live in pure shared packages with all tests green, and a thin end-to-end path shows it works: seeded services in Firestore, rendered by both the web and mobile apps.

**Not in Stage 2:** no feature migration, no auth flows, no domain callables, no deletion of the legacy backend, no real Firebase project, no deployment.

### 20.1 Prerequisites

| Item | Owner |
| --- | --- |
| Install **JDK 21** (for the Firestore, Auth and Storage emulators) | You |
| Answer **D1** (mobile Firebase SDK) and **D6** (app IDs / domain; a placeholder is fine) | You |
| `firebase-tools` installed as a root dev dependency (no global install needed) | Stage 2 |

### 20.2 Work, in order

**Step 1 — Workspace and tooling**

- `pnpm-workspace.yaml`: build allow-list for `@prisma/client`, `@prisma/engines`, `prisma`, `esbuild`, and Firebase/Expo native build dependencies as needed. This fixes the failing install.
- `.npmrc`: `node-linker=hoisted` (Expo/Metro compatibility).
- Root `package.json`: name `service-flow`, `packageManager` pinned. Scripts:

  | Script | Purpose |
  | --- | --- |
  | `dev:web` | start the web app |
  | `dev:mobile` | start the mobile app |
  | `emulators` | start the Firebase emulators |
  | `seed` | seed the emulators |
  | `build` | build all apps |
  | `typecheck` | typecheck all packages |
  | `test` | unit tests |
  | `test:rules` | rules tests (starts emulators via `firebase emulators:exec`) |
  | `test:legacy` | legacy backend tests |

- Commit `pnpm-lock.yaml`.
- `tsconfig.base.json`: keep strict settings, and add a `bundler`-resolution variant for web, mobile and shared (legacy keeps commonjs).

**Step 2 — Rename (legacy stays green)**

- `@home-service/*` → `@serviceflow/*` across `apps/backend` and `packages/*` (the §19.1 checklist rows for existing files).
- Fix D-17 (the `ratings.service.ts` typecheck error) with a type-safe membership check.
- Gate: legacy `typecheck` passes and **45 + 15 tests pass**.

**Step 3 — `packages/shared` (pure domain)**

```text
src/
  enums.ts            BookingStatus, BookingActor, PreferredTime, VerificationStatus, PaymentStatus,
                      PaymentMethod, PayoutStatus, WalletTransactionType, CommissionScope,
                      DisputeStatus, NotificationChannel, MediaKind, ConversationState (const objects + types)
  schemas/            zod: Service, ServiceArea, Technician, Booking, Payment, WalletEntry, Payout,
                      Rating, Dispute, Settings; callable inputs declared for later stages
  bookings/state-machine.ts   (ported verbatim)
  matching/score.ts, eligibility.ts (new pure filterEligible), types.ts
  commission/resolve.ts (pure precedence), split.ts (pesewas)
  wallet/ledger.ts    applyLedgerEntry, reconcile
  money.ts            toMinor/fromMinor, formatGHS
  time.ts             zoned day/time helper (Africa/Accra default)
  whatsapp/text.ts    parseCustomTime, menus (rebranded)
  phone.ts, geo.ts, errors.ts (+ toHttpsErrorCode map), design-tokens.ts
```

- Tests: **port all 11 + 8 + 4 + 5 + 12 + 3** existing tests.
- Add new tests for `filterEligible` (service, area radius, availability window, time zone), commission precedence, pesewa split exactness, ledger apply and reconcile, and money formatting.
- The legacy backend keeps its own copies until each domain is replaced, so there is no cross-wiring during the transition.

**Step 4 — `packages/firebase` (contract)**

- `paths.ts`: typed collection and doc path builders for every §8.2 collection.
- `timestamp.ts`: the `TimestampLike` interface plus converters.
- `callables.ts`: a name → {input schema, output type} registry for all planned callables, declared but unimplemented, with a `health` callable implemented.
- Tests: path builders, and the converters round-trip.

**Step 5 — Firebase project config (emulators only)**

- `firebase.json`:
  - emulators: auth 9099, firestore 8080, functions 5001, storage 9199, UI 4000
  - functions source `apps/functions`, with a predeploy build
  - hosting `apps/web/dist`
  - rules and indexes paths
- `.firebaserc`: `default: demo-serviceflow`. The `demo-` prefix guarantees nothing real is touched.
- `firebase/firestore.rules`:
  - deny-all default
  - public read of `services` where `isActive` and of `serviceAreas`
  - signed-in read of `settings/platform`
  - the helper functions from §10.3
- `firebase/storage.rules`: deny-all.
- `firebase/firestore.indexes.json`: the §8.4 set.
- `firebase/tests/*.test.ts`:
  - unauthenticated can read active services, but not inactive ones
  - nobody can write services from a client
  - arbitrary collections are denied for read and write
  - an authenticated user can't read another user's `users` doc
  - Storage is denied

**Step 6 — `apps/functions` skeleton**

- Functions v2, Admin SDK, TypeScript strict, esbuild bundle to `lib/index.js` (inlines `@serviceflow/*`), region from config (default placeholder until D3).
- `lib/`: Admin initialisation, config (`defineString` / `defineSecret` declarations, **no secrets needed yet**), error → `HttpsError` mapper, and auth guards (`requireAuth`, `requireClaim`) with unit tests (the replacement for `auth.test`).
- `adapters/http/health.ts` (`system-health`), and a `health` callable.
- `scripts/seed.ts` (emulator only; refuses to run unless `FIRESTORE_EMULATOR_HOST` is set). It seeds:
  - 3 services with prices in pesewas
  - Accra `serviceAreas`: East Legon, Osu, Cantonments, Airport Residential, Labone, Adenta, Madina, Spintex, Tema, Dansoman, Achimota, Lapaz, Teshie, Nungua, Kasoa, Dzorwulu, Haatso
  - `settings/platform` (15%, GHS, GH, Africa/Accra, the current matching weights, 15 km)
  - a GLOBAL commission rule
  - the 4 existing sample technicians (VERIFIED, with areas and availability) and the sample customer, as Auth emulator users + docs
- `integrations/`: interface files **moved in** from legacy (PaymentProvider, WhatsAppProvider) and the mock implementations, with **no wiring yet**.

**Step 7 — `apps/web` shell**

- Vite + React + TS + React Router + Tailwind. `index.html` has the ServiceFlow title, meta description and theme colour.
- `lib/firebase.ts`: JS SDK initialisation from `VITE_FIREBASE_*`. It connects automatically to the emulators in development.
- Layouts and route shells from §11.2: public pages as simple placeholders, and `/app`, `/tech`, `/admin` as placeholders behind a stub guard.
- **Smoke feature:** the landing page lists live active services from Firestore (the emulator), with loading, empty and error states and GHS formatting from shared.
- `.env.example` (`VITE_FIREBASE_API_KEY`, `…_AUTH_DOMAIN`, `…_PROJECT_ID`, `…_STORAGE_BUCKET`, `…_APP_ID`, `VITE_USE_EMULATORS=true`).
- One component test (the services list renders from mocked data).

**Step 8 — `apps/mobile` shell**

- Expo + Expo Router + TS.
- `app.config.ts`: name **ServiceFlow**, slug `service-flow`, scheme `serviceflow`, Android package / iOS bundle (D6), and React Native Firebase config plugins (if D1 = React Native Firebase).
- Five-tab shell (Home, Jobs, Earnings, Notifications, Profile) with placeholder screens and the connectivity banner component.
- `lib/firebase.ts` connects to the emulators (Android emulator host `10.0.2.2`).
- **Smoke feature:** Home lists services from Firestore.
- `.env.example` (`EXPO_PUBLIC_FIREBASE_*`, `EXPO_PUBLIC_USE_EMULATORS`). `eas.json` with a `development` profile (only built when you choose to).
- One component test (jest-expo).

**Step 9 — Documentation and CI**

- `README.md` rewritten for ServiceFlow: architecture, prerequisites (Node, pnpm, JDK 21), quick start (install → emulators → seed → dev:web / dev:mobile), and how legacy is run.
- `docs/ARCHITECTURE.md`: a condensed version of §6–§7, with dependency rules.
- `docs/LEGACY_REMOVAL.md`: a per-domain checklist mapping each legacy module and test to its replacement.
- This plan updated with the Stage 2 status.
- `.github/workflows/ci.yml`: pnpm install → typecheck → unit tests → rules tests on emulators (JDK set up) → web build → functions bundle → mobile TypeScript compile.

### 20.3 Definition of done (verified and reported at the end of Stage 2)

- [ ] `pnpm install` succeeds from clean with no interactive approvals.
- [ ] `pnpm typecheck` passes for **every** package: legacy backend, database, shared, firebase, functions, web and mobile.
- [ ] `pnpm test` passes: legacy 60 + ported shared tests + new tests. Counts are reported.
- [ ] `pnpm test:rules` passes on the emulator.
- [ ] `pnpm build` produces `apps/web/dist` and a bundled `apps/functions/lib`.
- [ ] `pnpm emulators` + `pnpm seed` + `pnpm dev:web` shows the seeded services on the landing page (verified in a browser).
- [ ] The mobile project typechecks and bundles (`expo export`). With a dev build or emulator available, Home shows the services. If no device is available, this is reported honestly.
- [ ] No "Home Service" in user-visible strings or package metadata. Collections are unaffected.
- [ ] No secrets committed. `.env.example` exists for web, mobile and functions. `.gitignore` covers `.env*`, `lib/`, `dist/`, the emulator data directory, `.expo/` and native folders.
- [ ] No real Firebase project connected, and nothing deployed.

### 20.5 Stage 2 outcome (2026-09-30)

**Decisions applied:**

- **D1:** React Native Firebase.
- **D6:** development placeholders (`dev.serviceflow.app`, `admin@serviceflow.dev`).

**Verified results (clean `node_modules`, frozen lockfile):**

| Check | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | OK, no interactive approvals |
| `pnpm typecheck` | 8/8 packages pass (shared, firebase, rules-tests, functions, web, mobile, legacy API, legacy database) |
| `pnpm test` | 236 pass: shared 125, firebase 13, functions 26, web 21, mobile 6, legacy API 45 (unchanged) |
| `pnpm test:rules` | 16 pass on the Firestore and Storage emulators. A mutation check (opening a write rule) was caught |
| `pnpm build` | Web (130 KB gzipped shell + 126 KB lazy Firestore chunk); Functions bundle + generated deploy `package.json` |
| Mobile `expo export` (Android) | OK (3.7 MB Hermes bytecode); `expo install --check` clean |
| End to end | Emulators → seed → `system-status` / `system-health` OK → web renders seeded services live in headless Edge (1280px and 390px, no console errors, no horizontal scroll) |

**Deviations from the plan text, with reasons:**

- **`nodeLinker: hoisted`** lives in `pnpm-workspace.yaml` rather than `.npmrc`, because pnpm 11 reads settings there.
- **Security settings in `pnpm-workspace.yaml`:**
  - The minimum-release-age supply-chain protection was kept, not bypassed.
  - Build-script approvals: Prisma, esbuild, protobufjs and `@firebase/util` are allowed; `re2` is denied.
  - A single Firebase JS SDK version is pinned via `overrides`, which fixes a duplicate-SDK failure in the rules tests.
- **Functions health endpoints:** the callable is `system-health`. The plain HTTP health check is `system-status`, because a callable and an HTTP function can't share a name.
- **Functions deploy source:** `firebase.json` points at the generated `apps/functions/dist` (a bundle plus a runtime-only `package.json`), so `workspace:*` dependencies never reach cloud `npm install`.
- **Web Firebase modules:** the Firebase SDK is split per service (`lib/firebase/*`), and the Firestore-backed section is lazy-loaded. This halved the critical-path JavaScript on mobile data.
- **Mobile TypeScript:** the mobile app uses TypeScript ~6.0 (required by Expo SDK 57). Everything else stays on 5.9, because the legacy backend's `moduleResolution: node` is deprecated in TypeScript 6.
- **Legacy database `tsconfig`:** `rootDir` was fixed, a pre-existing error that the old failing install had hidden.

**Not verified in Stage 2:**

- **The mobile app has not run on a device or emulator.** This machine has no Android SDK. Typecheck, unit tests, the Android bundle and the prebuild config were verified. A development build (`pnpm --filter @serviceflow/mobile android`) is the first on-device check.
- **The emulator runs used a portable JDK 21** in a temporary session folder. Developers need their own JDK 21, and CI installs Temurin 21.
- **CI (`.github/workflows/ci.yml`) has not run on GitHub yet**, because nothing has been pushed.

### 20.4 Stage 2 open inputs

| ID | Decision | Recommendation | Needed |
| --- | --- | --- | --- |
| D1 | Mobile Firebase SDK | **React Native Firebase + Expo dev builds** (offline persistence, native FCM and App Check). The alternative, the JS SDK, works in Expo Go but has no persistent offline cache | Before Stage 2 step 8 |
| D6 | App identifiers and domain | e.g. `com.serviceflow.app` / `serviceflow.com.gh`, or a placeholder | Before Stage 2 step 8 |
| D2 | Phone OTP mechanism | Custom OTP → custom token (SMS or WhatsApp delivery) | Auth stage |
| D3 | Firebase region | Measure; `europe-west1` is the likely choice | Before a real project is created |
| D4 | Final price authority | **Decided (2026-10-02): technician quotes within the service range, customer accepts before work starts, admin can override (audited).** Built in Stage 7 | Bookings stage |
| D5 | Cash jobs and commission | Post gross EARNING_CREDIT + COMMISSION_DEBIT; for cash, only the COMMISSION_DEBIT (receivable), netted against future earnings, with withdrawals blocked while negative | Payments stage |
| D7 | Does any production data or users exist on the legacy system? | Assumed **no**, so there is no data migration | Before the Auth stage |

---

## 21. Stage 3: Authentication (2026-10-01)

**Decision D2 resolved:** custom OTP exchanged for a Firebase custom token (recommended option). Stage 2 was committed first on branch `stage-2-foundation` (`77e3245`); Stage 3 is on `stage-3-auth`.

### Scope delivered

| Area | Delivered |
| --- | --- |
| Phone sign-in | `auth-requestOtp` / `auth-verifyOtp`. CSPRNG 6-digit code, salted scrypt hash, 5-minute expiry, 5 attempts, single use, new code replaces old. Custom token on success. `OtpSender` abstraction with an emulator-only mock |
| Abuse limits | 30 s resend cooldown; 3 codes per phone per 10 minutes; 20 requests per network per hour (hashed keys) |
| Accounts | Auth user and `users/{uid}` created on first verify (never on request: no enumeration). `lastLoginAt` and capability mirror refreshed on sign-in |
| Admin | Email/password sign-in on web (tab-scoped session, 30-minute idle sign-out). `pnpm bootstrap:admin` (emulator-only) |
| Suspension (fixes D-10) | `admin-suspendUser` / `admin-reactivateUser`: admin claim + sign-in within 15 minutes + active admin. Transactional status change, technician taken offline, audit entry keyed by request id (idempotent retries). Auth user disabled and tokens revoked. `requireActiveUser` blocks suspended users on the next call |
| Rules | `users/{uid}`: owner and admin read; owner may change only `displayName` (string, ≤ 80 characters) while ACTIVE; no client create or delete. `otpChallenges` and `rateLimits` stay server-only |
| Web | `/login`, `/login/verify`, `/admin/login`. Real guards for `/app`, `/tech` (tech claim), `/admin` (admin claim). Signed-in identity and sign-out. The Auth SDK loads lazily, after the page shell |
| Mobile | React Native Firebase Auth + Functions. Phone and code screens; signed-out users are redirected to sign-in; Profile shows the account and sign-out |

### Verified results

| Check | Result |
| --- | --- |
| `pnpm typecheck` | 8/8 packages |
| `pnpm test` | 281 pass: shared 130, firebase 13, functions 42, web 41, mobile 10, legacy API 45 (unchanged) |
| `pnpm test:rules` | 23 pass (users, auth internals, plus all Stage 2 rules) |
| `pnpm test:integration` (new) | 24 pass on the Auth, Firestore and Functions emulators. Includes custom-token sign-in proven with the client SDK, and the deployed callables over HTTP |
| Browser end to end | 13/13: guarded redirect with `next`, invalid number, dev code, wrong code, sign-in back to the original page, customer refused `/admin`, sign-out to the home page, admin login (wrong password refused, then success), no console errors |
| Mobile | Typecheck, 10 tests, Android bundle, `expo install --check` |

### Found and fixed during the stage

- **Sign-out landed on the login page instead of the home page.** The guard reacted to the session ending before navigation happened. Fixed by leaving the guarded area first. This was caught by the browser test.
- **Functions were registered in the wrong region.** Imports are hoisted, so `onCall` ran before `setGlobalOptions` (fixed via `lib/global-options.ts` as the first import). This was caught in Stage 2 and is noted here because every new callable relies on it.

### Not in this stage

- Customer and technician profiles (next stage: Users and profiles).
- Technician registration (`tech` claim) and verification.
- A real SMS or WhatsApp OTP provider.
- App Check enforcement and admin MFA (production hardening).
- A production admin bootstrap (needs a real project, Decision D3).
- Legacy auth removal is **deferred**: the remaining legacy routes depend on it (see `docs/LEGACY_REMOVAL.md`).

---

## 22. Stage 4: Users and profiles (2026-10-01)

Stage 3 was committed as `3816252` on `stage-3-auth`. Stage 4 is on `stage-4-profiles`.

### Scope delivered

| Area | Delivered |
| --- | --- |
| Data model | `customers/{uid}` (`fullName`, `defaultAddressId`, timestamps) and `customers/{uid}/addresses/{id}` (label, landmark directions, optional GhanaPost GPS, catalogue area + name, location, notes, timestamps). Replaces the `defaultLocation` field planned in §8.2: addresses became a subcollection so the rules can validate them |
| Shared | `profile.ts`: name rule (any script, including Ɛ and Ɔ), GhanaPost GPS normalisation/validation, limits. `customerDoc`, `customerAddressDoc`, `customerProfileInput` and `addressInput` schemas |
| Rules | Owner-only, ACTIVE-only writes. Exact field sets and length limits, GhanaPost GPS format, active area with a matching name (no spoofing), server timestamps, immutable `createdAt`, the default must exist, and the current default can't be deleted unless moved in the same batch. Owner and admin read; admins can't edit; no client delete of profiles |
| Web | One-time welcome step (name, then optional main address). `/app` is gated on having a profile. Profile page: rename (kept in step with `users.displayName`); add, edit, delete (with confirmation) and set-default addresses; 10-address limit. Dashboard greets by first name and shows the default address |
| Mobile | Profile tab: edit display name (`users.displayName`, plus `customers.fullName` when a profile exists). Success is shown only after the server accepts |
| Seed | The customer now has a profile and a default address with a GhanaPost GPS code |

### Verified results

| Check | Result |
| --- | --- |
| `pnpm typecheck` | 8/8 packages |
| `pnpm test` | 309 pass: shared 143, firebase 13, functions 42, web 62, mobile 13, legacy API 45 (unchanged) |
| `pnpm test:rules` | 42 pass (19 new profile/address tests). A mutation check (removing area-name anti-spoofing) was caught |
| `pnpm test:integration` | 24 pass (unchanged; Stage 4 adds no Functions) |
| Browser end to end, profiles | 14/14 on fresh emulators: welcome step, invalid name, profile + address saved through the real rules, dashboard greeting, add/make-default/delete/rename, persistence after reload, returning customer skips the welcome step, no console errors |
| Browser end to end, auth (regression) | 14/14: the Stage 3 flows still pass, now including the welcome step for a brand-new user |
| Web build | First-load chunk 98 KB gzipped (Stage 2: 130 KB). Firestore (130 KB) and Auth (23 KB) load on demand |

### Found and fixed during the stage

- **Bundle regression.** Importing the profile provider in the router pulled the Firestore SDK into the first-load chunk (273 KB gzipped). The customer area is now code-split, so public pages don't download Firestore.
- **Lost destination.** A new user who signed in to reach a specific page (for example `/app/bookings`) landed on `/app` after the welcome step. The welcome step now returns to the requested page, accepting only customer-area paths.
- **No way out of the welcome step.** It sits outside the area layout, so a user who signed in with the wrong number couldn't sign out. A "Wrong number? Sign out" link was added.
- The e2e harness had its own timing bugs (acting before pages rendered, and a text match that also hit "Saved addresses"). These were fixed in the harness; they were not product issues.

### Not in this stage

- Technician profiles, registration and verification (next: Technician onboarding).
- Admin customer lists (Web dashboards).
- Changing the sign-in phone number.
- Device location pins (Bookings).
- Push device tokens (Notifications).
- Account deletion / data-export requests under Ghana's Data Protection Act. **Flagged for the production-hardening stage.**

---

## 23. Stage 5: Services (2026-10-01)

Stage 4 was committed as `9953560` on `stage-4-profiles`. Stage 5 is on `stage-5-services`.

### Scope delivered

| Area | Delivered |
| --- | --- |
| Callables | `admin-upsertService` (create/edit) and `admin-setServiceActive` (hide/show, optional reason). Both require the admin claim and an ACTIVE account, are transactional, write an audit entry with before/after of changed fields, and are idempotent per request id |
| Catalogue rules | The id is the slug, fixed at creation. Names are unique regardless of case and spacing. Prices are whole pesewas with min ≤ max and a sanity cap. Services are hidden, never deleted |
| Shared | `catalogue.ts` (`slugify`, `serviceNameKey`, limits), `upsertServiceInput`, `setServiceActiveInput`, `optionalInput()` |
| Web admin | `/admin/services`: live list of all services, including hidden ones. Create and edit (prices typed in cedis, web-address preview), hide/show with confirmation and a reason for the audit log. Each submission keeps one request id across retries |
| Web public | `/services` (live list) and `/services/:slug` (hidden or unknown services read as "not available"); service cards link to their page. Firestore stays out of the first-load chunk (68 KB gzipped) |

### Verified results

| Check | Result |
| --- | --- |
| `pnpm typecheck` | 8/8 packages |
| `pnpm test` | 345 pass: shared 157, firebase 13, functions 42, web 75, mobile 13, legacy API 45 (unchanged) |
| `pnpm test:rules` | 42 pass (rules unchanged; catalogue writes were already server-only) |
| `pnpm test:integration` | 37 pass (13 new: create, idempotent retry, duplicate name/slug, edit audit, hide/show, HTTP auth checks, and the `undefined` → `null` regression) |
| Browser end to end | Services 12/12, profiles 14/14, auth 14/14 on fresh emulators |

### Found and fixed during the stage

- **Creating a service from the admin page always failed with "Invalid request".** The Firebase callable SDK sends `undefined` fields as `null`, and the schemas rejected `null`. Integration tests omitted the field and web tests mocked the store, so only the browser run caught it. Fixed for all 12 optional callable fields with `optionalInput()`. Regression tests were added at the contract level and over HTTP through the real client SDK.
- **Validation errors showed "Invalid request".** The web app now shows the first field message the server returns.
- **A duplicate name was reported as a web-address clash.** The name check now runs first, so the message says "Another service is already called …".

### Not in this stage

- Service icons/images (Storage arrives with Technician onboarding).
- Technicians selecting services (Technician onboarding).
- Commission rules per service (Payments).
- Removing the legacy services module: deferred, because the legacy WhatsApp bot still reads services through Prisma.

## 24. Stage 6: Technician onboarding and verification (2026-10-01)

Stage 5 was committed as `900c04f` on `stage-5-services`. Stage 6 is on `stage-6-technicians`.

### Scope delivered

| Area | Delivered |
| --- | --- |
| Shared | `technician.ts`: verification state machine with actors (`assertVerificationTransition`, `canSubmitVerification`, `canGoOnline`), review decisions, Ghana Card normalization (`GHA-123456789-0`) and other ID formats, limits, default hours, overlap check. Callable schemas `registerTechnicianInput`, `updateTechnicianServicesInput`, `submitVerificationInput`, `reviewTechnicianInput` |
| Callables | `technicians-register` (technician + wallet docs, `tech` claim with existing claims preserved, idempotent), `technicians-updateServices` (active services/areas only; area coordinates copied from the catalogue), `technicians-submitVerification` (files must exist in the caller's private submission folder, be images ≤ 8 MB, and differ; idempotent per submission), `admin-reviewTechnician` (admin + active + recent sign-in, no self-review, reason required to reject/suspend, audited, forces offline unless verified) |
| Firestore rules | `technicians`: readable when signed in; owner may change only bio, experience, own profile photo path, `isOnline` (true only while VERIFIED) and `updatedAt`. `technicianVerifications`: owner and admins read, no client writes |
| Storage rules | Rewritten deny-by-default. Profile photos: public to signed-in users, written by the active technician (image ≤ 5 MB). Verification documents: create-only by the active owner (image ≤ 8 MB, no overwrite or delete), readable only by the owner and admins |
| Web | `/become-a-provider`, `/tech/register` (claim refreshed immediately), provider dashboard (status, checklist, online switch), services/areas/hours, verification (compressed uploads, status, rejection reason, history), provider profile; admin verification queue with the private photos and a technicians list with suspend/reinstate. All lazy-loaded; first-load chunk still 69 KB gzipped |
| Mobile | Home shows "Become a provider", the onboarding checklist, or the online switch (only when verified). `app/tech/register`, `work` (service/area chips, per-day hours), `verification` (camera/gallery via `expo-image-picker`, front camera for the selfie, ≤1600 px JPEG compression via `expo-image-manipulator`, `putFile` upload to Storage). Profile links to the provider screens. Added `@react-native-firebase/storage`, `expo-image-picker` (with permission strings), `expo-image-manipulator` at SDK 57 versions |

### Verified results

| Check | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | OK |
| `pnpm typecheck` | 8/8 packages |
| `pnpm test` | 393 pass: shared 169, firebase 13, functions 42, web 93, mobile 31, legacy API 45 (unchanged) |
| `pnpm test:rules` | 57 pass (10 new technician rules tests; Storage rules tests rewritten, 8) |
| `pnpm test:integration` | 53 pass (14 technician domain tests + HTTP auth checks; now runs with the Storage emulator) |
| `pnpm build` | OK; web first-load chunk 69 KB gzipped, technician store 8.8 KB gzipped (lazy) |
| Mobile | `expo install --check` up to date; `expo export` Android bundle OK; config plugin applies camera/photo permission strings |
| Browser end to end | Technician onboarding 15/15 (register → services/areas → real ID + selfie uploads → admin views private photos and approves → technician goes online), profiles 14/14, services 12/12, auth 14/14 |

### Found and fixed during the stage

- **Verification files could be overwritten after submission.** The first Storage rule allowed a second write to the same path, so a technician could swap a photo after an admin had seen it. A rules test caught it; documents are now create-only (`resource == null`).
- Legacy defects fixed in the replacement: **D-9** (any status could resubmit and reset to PENDING) and **D-15** (verification "uploads" were arbitrary client-supplied URLs).

### Not in this stage

- Running the mobile app on a device or emulator (no Android SDK/JDK-based native build in this environment); mobile is verified by component tests, typecheck and the Metro bundle.
- Technician profile photo on mobile (web supports it; mobile edits arrive with the technician mobile workflow).
- Push notifications on review decisions (Notifications stage).
- Removing the legacy technicians module: deferred, because legacy bookings, matching and the WhatsApp bot read technicians through Prisma.

## 25. Stage 7: Bookings (2026-10-02)

Stage 6 was committed as `cc8bc81` on `stage-6-technicians`. Stage 7 is on `stage-7-bookings`.

Decisions taken at the start of the stage: **D4** — the technician quotes within the service range, the customer accepts, work can't start until then, and an admin can override (audited). **Scope** — the booking lifecycle now; matching (candidates, offers, expiry) in Stage 8.

### Scope delivered

| Area | Delivered |
| --- | --- |
| Shared | `bookings/booking.ts`: quote rules (`QuoteStatus`, `canSubmitQuote`, `canRespondToQuote`, `canAdminSetPrice`, `isQuoteWithinRange`), `ACTIVE_JOB_STATUSES`, `CONTACT_VISIBLE_STATUSES`, `TIMELINE_FIELD`, `scheduleProblem` (1 hour to 30 days ahead), customer status labels. Booking document gains quote status/note/rejection reason, `priceSetBy` and `timeline`; new `bookingContactDoc`. Callable inputs: create (saved address *or* location pin, optional WEB/MOBILE channel), respond to offer, advance, submit quote, respond to quote, confirm, cancel, admin reassign, admin set price |
| Callables | `bookings-create`, `-respondToOffer`, `-advance`, `-submitQuote`, `-respondToQuote`, `-confirmCompletion`, `-cancel`; `admin-reassignBooking`, `admin-setBookingPrice` (recent sign-in). All check an active account; ownership and actor come from the booking, never the client |
| Domain | Single status writer with history and stage timestamps; deterministic booking ids; per-request receipts for safe retries; max 3 open bookings per customer; estimate copied from the service; technician must be VERIFIED and free to accept; counters and `activeBookingId` in the same transaction; commission snapshot at confirmation; admin actions audited |
| Rules + indexes | Bookings, history: participants and admins read, no client writes; private contact: customer, admins, assigned technician from ACCEPTED to COMPLETED; receipts closed. Indexes for `participantIds` + `createdAt` and `customerId` + `status` |
| Web | `/app/request` (service preselected from `/services/:slug`, saved address, ASAP/today/tomorrow/scheduled), `/app/bookings` (open/past), `/app/bookings/:id` (live status, timeline, accept/decline price, confirm, cancel); dashboard lists open bookings; `/admin/bookings` (status filter) and `/admin/bookings/:id` (contact, quote, commission, history, set price, reassign, cancel). All lazy; first-load chunk 69 KB gzipped |
| Mobile | Home "Request a service" / "Your bookings" and open bookings; `app/bookings` list, request (ASAP/today/tomorrow) and detail with accept/decline price, confirm and cancel. Technician job screens come in the Technician mobile workflow stage |

### Verified results

| Check | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | OK (no new dependencies) |
| `pnpm typecheck` | 8/8 packages |
| `pnpm test` | 432 pass: shared 185, firebase 13, functions 42, web 108, mobile 39, legacy API 45 (unchanged) |
| `pnpm test:rules` | 63 pass (6 new booking rules tests) |
| `pnpm test:integration` | 74 pass (19 booking domain tests + 2 over HTTP) |
| `pnpm build` | OK; web first-load chunk 69 KB gzipped, booking pages 3.5 KB and admin bookings 2.9 KB gzipped (lazy) |
| Mobile | `expo install --check` up to date; `expo export` Android bundle OK |
| Browser end to end | Bookings 22/22 (request from a service page → offer stand-in → technician accepts, travels and quotes through the real callables → customer accepts the price live → completion → confirmation with locked price and 15% commission → second booking cancelled → admin views), technicians 15/15, profiles 14/14, services 12/12, auth 14/14 |

### Found and fixed during the stage

- **Open-booking limit could be bypassed** by a customer with many old bookings: the first version counted open bookings among the newest 50 fetched. It now queries open statuses directly.
- **History read like live prompts** ("Work completed — please confirm" on a finished job). The timeline now uses past-tense event labels.
- **Every booking was recorded as WEB.** Clients may now state WEB or MOBILE (informational only; WhatsApp and admin sources are server-set).
- Legacy defects fixed in the replacement: **D-1**, **D-2**, **D-8**.
- The profile e2e check "changes persist after reload" failed once and passed on every rerun — a timing-sensitive check, noted for hardening.

### Not in this stage

- Matching: REQUESTED → MATCHING → OFFERED, candidate snapshot, `bookings-selectTechnician` (D-6), offer and matching expiry (D-12) — Stage 8. Tests stand in for it by setting OFFERED directly.
- Technician job screens (accept/decline, next step, quote) on mobile and web — Technician mobile workflow stage. The callables exist and are tested.
- Payment invoice at confirmation, ratings, disputes (`DISPUTED` transitions) — their stages.
- Scheduling a specific time on mobile (no date picker yet) and adding addresses on mobile.
- Removing the legacy bookings module: deferred, because the legacy WhatsApp bot still books through it.
