# ServiceFlow architecture

A condensed, living version of SERVICEFLOW_MIGRATION_PLAN.md §6–§8. Update this file when the architecture changes.

## One backend, three clients

```text
   Web (React)        Mobile (Expo, RN Firebase)        WhatsApp (Meta)
        │                       │                             │ webhook
        │  reads: Firestore listeners (Security Rules)        ▼
        │  writes: callable Functions ─────────────┐   webhooks → queue
        └───────────────────────┬──────────────────┘          │
                                ▼                             ▼
             Cloud Functions: adapters (callables · HTTP · triggers · schedulers)
                                │
                     domain services  ──uses──►  @serviceflow/shared (pure rules)
                                │
                       Firestore · Storage · FCM
```

- **Reads** go straight from clients to Firestore, filtered by Security Rules, in real time.
- **Writes** that touch status, money, eligibility, verification or other users go through **callable Functions**. Clients write directly only to a small allow-list of self-owned, non-sensitive fields validated by rules.
- **One code path**: callables, WhatsApp handlers and schedulers call the same domain services, which call the same pure rules in `@serviceflow/shared`. There is no separate WhatsApp booking system.

## Packages and dependency rules

```text
@serviceflow/shared  ←  @serviceflow/firebase  ←  { apps/web, apps/mobile, apps/functions }
```

| Package | Contains | Must NOT import |
| --- | --- | --- |
| `packages/shared` | Enums, zod schemas (documents + callable inputs), booking state machine, matching (eligibility + scoring), commission, wallet ledger, money, phone, geo, time zones, design tokens | Firebase, React, React Native, Node-only APIs |
| `packages/firebase` | Collection/storage path builders, callable registry (name + input + output), `parseDoc`/`parseDocs`, `TimestampLike` | Any Firebase SDK |
| `apps/functions` | Adapters, domain services (from the Bookings stage on), provider integrations, seed | React |
| `apps/web` | UI; Firebase JS SDK split per service (`lib/firebase/*`) so pages load only what they use | Admin SDK, secrets |
| `apps/mobile` | UI; React Native Firebase (native offline persistence, FCM, App Check) | Admin SDK, secrets |

Apps never import each other. Internal packages are source-only TypeScript (`main: src/index.ts`); Vite, Metro and esbuild compile them.

## Key conventions

- **Money** is integer minor units (pesewas) everywhere (`amountMinor`), formatted only at the UI edge with `formatMoney`.
- **Time** in Firestore is a `Timestamp`; business time is evaluated in `settings/platform.timezone` (`Africa/Accra`), never the server's clock.
- **Idempotency**: uniqueness comes from deterministic document ids (`payments/{bookingId}`, `ratings/{bookingId}`, `wallets/{uid}/transactions/earning_{bookingId}`, …); every mutating callable takes a client `requestId`.
- **Roles** are capability custom claims set only by Functions: `{ tech?: true, admin?: true }`. Every signed-in user is a customer. Verification status is data, not a claim.
- **Security**: Firestore and Storage rules deny by default; each collection is opened explicitly in the stage that introduces it, with tests for both allowed and denied access (`firebase/tests`).

## Authentication (Stage 3)

```text
Phone (customer / technician)                         Admin
  /login → auth-requestOtp ──► OtpSender (mock in emulator; SMS/WhatsApp later)
  /login/verify → auth-verifyOtp ──► custom token      /admin/login → email + password
        └──► signInWithCustomToken (web: JS SDK, mobile: RN Firebase)
```

- **One flow on every client** (Decision D2): the OTP is generated with the CSPRNG, stored only as a salted scrypt hash at `otpChallenges/{e164}` (server-only), expires after 5 minutes, allows 5 attempts and is single-use. A new code replaces the old one.
- **Abuse limits**: a 30 s resend cooldown, 3 codes per phone per 10 minutes, and 20 requests per network per hour (`rateLimits/{hashed key}`, no raw IPs stored). A code request never creates an account, so phone numbers can't be enumerated.
- **Accounts**: the first successful verify creates the Firebase Auth user (one per phone) and `users/{uid}`. Suspension is checked only *after* the code is verified.
- **Suspension** (`admin-suspendUser` / `admin-reactivateUser`): admin claim, a sign-in within 15 minutes and an active admin account are all required. One transaction updates `users/{uid}.status`, takes a technician offline and writes `adminActions/{admin}_{requestId}`; then the Auth user is disabled and refresh tokens revoked. `requireActiveUser` makes it effective on the very next call.
- **Sessions**: web customers/technicians persist on the device; admin sessions last for the tab, with a 30-minute idle sign-out. Mobile sessions persist natively. Route guards are UX only.
- **Emulator conveniences** never reach production: the mock OTP sender refuses to run outside the Functions emulator, and the code is echoed to the client (`devCode`) only there.

## Customer profiles (Stage 4)

- `customers/{uid}` holds `fullName` and `defaultAddressId`; saved addresses live in `customers/{uid}/addresses/{id}` (a subcollection, because rules can validate each document but not array items).
- **Written directly by the owner** — self-owned, non-sensitive data — so the Firestore rules are the validation: owner + ACTIVE account only, exact field sets, name/label/directions limits, GhanaPost GPS format (`XX-NNN(N)-NNNN`), an active catalogue area whose `areaName` must match, server timestamps, `createdAt` immutable, the default must exist and the current default can't be deleted unless the same batch moves it. The shared zod schemas apply the same rules in the forms.
- Ghana-first addressing: label + landmark directions + service area (+ optional GhanaPost GPS digital address and notes). The location is the area centre for now; a precise device pin comes with booking requests.
- Multi-document changes are batched (profile + first address + `users.displayName`; delete-default + move-default). Snapshots read pending server timestamps as estimates so local writes render immediately, but the UI confirms success only after the write is accepted.
- Limits rules can't express (at most 10 saved addresses) are enforced in the apps.

## Service catalogue (Stage 5)

- Services are data, changed only through `admin-upsertService` / `admin-setServiceActive` (admin claim + active account). Each call is a transaction that also writes `adminActions/{admin}_{requestId}` (before/after of changed fields), so retries are idempotent.
- The id is the slug (`home-cleaning`), fixed at creation; names are unique case-insensitively (`nameKey`); prices are pesewas with min ≤ max; services are hidden, never deleted. Rules keep catalogue writes server-only and hide inactive services from everyone but admins.
- **Callable inputs and `null`**: the Firebase callable SDKs serialise `undefined` as `null`. Every optional callable field uses `optionalInput()` (shared), which treats `null` as absent — required for any client, including WhatsApp later.

## Technician onboarding and verification (Stage 6)

- **Becoming a provider** is a callable (`technicians-register`): one transaction creates `technicians/{uid}` (UNSUBMITTED) and `wallets/{uid}` and records the capability on `users/{uid}`, then the `tech` custom claim is set (existing claims preserved). Clients force an ID-token refresh so the provider area opens immediately. Idempotent.
- **Services, areas and hours** go through `technicians-updateServices`: services and areas must exist and be active, and area coordinates/radius are copied from the catalogue, so a client can't place a technician anywhere. Hours are validated (HH:MM, end after start, no overlaps).
- **Verification**: the client compresses the ID photo and selfie (≤1600 px JPEG) and uploads them to `verifications/{uid}/{submissionId}/` in Storage — create-only, owner (active technician) only, image ≤ 8 MB, readable only by the owner and admins. `technicians-submitVerification` checks both files exist in that folder, are images and within the limit, normalizes the ID number (Ghana Card → `GHA-123456789-0`) and moves the technician to PENDING. The doc id `{uid}_{submissionId}` makes retries idempotent.
- **State machine** (shared `technician.ts`): UNSUBMITTED/REJECTED → PENDING (technician); PENDING → VERIFIED/REJECTED, VERIFIED ⇄ SUSPENDED (admin). `admin-reviewTechnician` requires the admin claim, an active account and a **recent sign-in**, forbids self-review, needs a reason to reject or suspend, writes the audit entry, and forces `isOnline = false` for any non-verified outcome.
- **Direct owner writes** to `technicians/{uid}` are limited by rules to `bio`, `yearsExperience`, `photoPath` (own profile folder), `isOnline` and `updatedAt` — and `isOnline` can be true only while VERIFIED. Verification status, services, areas and stats are server-only.
- Web: `/become-a-provider` → `/tech/register` → `/tech` (status + checklist + online switch), `/tech/availability`, `/tech/verification`, `/tech/profile`; admin `/admin/verification` (queue with the private photos) and `/admin/technicians`. Mobile: the same flow under `app/tech/*` with camera/gallery capture (`expo-image-picker`), on-device compression (`expo-image-manipulator`) and `putFile` uploads; the Home online switch exists only once verified.

## Bookings (Stage 7)

- **One writer of status.** `writeTransition` (apps/functions/src/domains/bookings/common.ts) is the only code that changes `bookings.status`: it checks the shared state machine for the transition *and* the actor, stamps the stage timestamp (`timeline.*`), and appends immutable `statusHistory` — inside the caller's transaction, after re-reading the booking. Rules deny every client write to bookings.
- **Idempotency.** Creating uses a deterministic id (`bk_` + hash of customer and request id). Every other action writes a receipt `bookings/{id}/requests/{uid}_{requestId}` in the same transaction, so a retried request is a no-op instead of an error or a double change. Receipts are server-only.
- **Ownership (fixes D-1).** The caller's role *on this booking* decides the actor: its customer, its assigned technician, or an admin (audited). Offered-but-not-accepted technicians can only accept or decline.
- **Price authority (Decision D4).** The assigned technician quotes within the service's price range (ACCEPTED/EN_ROUTE/ARRIVED); the customer accepts or declines with a reason; work can't start (ARRIVED → IN_PROGRESS) until a price is agreed. `admin-setBookingPrice` sets any amount (recent sign-in, reason, audited). On confirmation the server locks `finalMinor` from the agreed quote — never a client figure (fixes D-2) — and snapshots the commission percent (technician → service → global rule → platform default).
- **Counters in the transaction (fixes D-8).** Offer responses, completed and technician-cancelled jobs, and the technician's `activeBookingId` (one job at a time) change in the same transaction as the transition.
- **Privacy.** The customer's phone and landmark directions live in `bookings/{id}/private/contact`, readable by the customer, admins, and the assigned technician only from ACCEPTED until COMPLETED. Bookings are readable by `participantIds` (customer + offered/assigned technician) and admins; list queries must use `participantIds array-contains <uid>`.
- **Not yet:** the payment invoice is created at confirmation from the Payments stage on.

## Matching (Stage 8)

- **Run on create.** `bookings-create` runs matching right after the booking is written (REQUESTED → MATCHING, SYSTEM). If matching fails the booking still exists; the sweep or the customer's "Search again" (`bookings-rematch`) retries.
- **Query, then pure rules.** Firestore query: VERIFIED + online + offers the service (indexed). Then in code: not busy (`activeBookingId`), not the customer, not a previous decliner, inside a service area's radius, and available at the needed time in `settings/platform.timezone` (TOMORROW uses tomorrow's hours). The shared deterministic score (weights and radius from `settings/platform`) ranks them; the top 3 are stored on the booking as `candidates`.
- **Customer chooses (fixes D-6).** `bookings-selectTechnician` only accepts a stored, still-selectable candidate, re-checks them (verified, online, free, offers the service), sets `offerExpiresAt` (`offerTimeoutMinutes`) and counts the offer — all in one transaction.
- **Back to matching.** A decline, an expired offer or an admin reassignment returns the booking to MATCHING; the technician is excluded from it, and if nobody selectable is left a new search runs. The matching deadline is extended, never shortened.
- **Expiry sweep (fixes D-12).** `schedules-sweepBookings` runs every minute: expired offers go back to matching (SYSTEM), bookings still unmatched after `matchingExpiresAt` (the matching window, or the scheduled time) are cancelled by SYSTEM with a reason, and bookings without candidates are searched again. The state machine now lets SYSTEM cancel REQUESTED/MATCHING bookings — the only change to the ported table. The emulator doesn't run schedules; integration tests call the sweep directly.

## Technician mobile workflow (Stage 9)

- **Jobs tab** (`app/(tabs)/jobs.tsx`): new requests with a live countdown to `offerExpiresAt`, active, upcoming (scheduled) and done — the user's participant bookings filtered to jobs where they are the offered or assigned technician (`jobBucket` in shared). Home shows the current job and new requests.
- **Job screen** (`app/job/[id].tsx`, presentational `JobView`): accept/decline (optional reason) while the offer is live; then **one large primary button** for the next step (`nextTechnicianStep`): on my way → arrived → start work (disabled until the customer accepts a price) → finish job (optional notes). Every success shows only after the server confirms.
- **Customer contact** (phone, directions, GhanaPost GPS) is subscribed only once the job is accepted (rules deny it before); "Call customer" uses `tel:`, "Navigate" opens Google Maps (`google.navigation:q=lat,lng`, falling back to the maps website) — no in-app map SDK.
- **Location** is captured once at "on my way" (`expo-location`, foreground, last known fix if recent) and stored as `enRouteLocation`; refusing permission never blocks the step. No background tracking.
- **Job photos**: before photos from ARRIVED, after photos from IN_PROGRESS (`canAddJobPhoto`). The app compresses (≤1600 px JPEG), uploads to `bookings/{id}/{BEFORE|AFTER}/` — Storage rules: only the assigned technician, only in those statuses, create-only, image ≤ 8 MB; participants and admins can read — then `bookings-addJobPhoto` checks the file exists, is an image within the limit and is in that booking's folder, and records `bookings/{id}/media/{hash(path)}` (idempotent, at most 10 per job). Customers and admins see the photos and completion notes on the web booking pages.

## Web dashboards (Stage 10)

- **Admin home**: headline numbers from Firestore count queries (bookings today, waiting for a technician, jobs in progress, technicians online, verifications to review; refreshed every minute) and a live list of bookings waiting or in progress.
- **People**: customers list (search by name) and detail (phone, addresses, bookings, account status); technician detail (stats incl. completion and response rates, verification history, jobs, verification suspend/reinstate). Account suspension/reactivation uses the Stage 3 callables (recent sign-in, audited) — now with a web UI.
- **Audit log** (`/admin/audit`): `adminActions`, newest first, filtered by target type and searchable, with before → after for every changed field. Rules: admins read, nobody writes from a client.
- **Settings** (`/admin/settings`): platform settings (default commission, offer time, matching time, search radius, support phone), commission rules (create; switch on/off — rules are never edited) and service areas (create/edit inside Ghana's bounds; hide/show). New callables `admin-updatePlatformSettings`, `admin-createCommissionRule`, `admin-setCommissionRuleActive` (all three need a recent sign-in: they affect money), `admin-upsertServiceArea`, `admin-setServiceAreaActive` — each one transaction with its audit entry, idempotent per request, values bounded by shared `SETTINGS_LIMITS`.
- **Technician web**: `/tech/jobs` and `/tech/jobs/:id` with the same rules as the mobile app (offer countdown, one next step, quote, contact after acceptance, Google Maps directions link, cancel); photos stay on mobile. The provider dashboard shows the current job and new requests.
- **Public**: How it works, About, Contact. Remaining placeholders (payments, payouts, disputes, reports, earnings, wallet, reviews) name the stage that builds them.

## Payments (Stage 11)

- **Invoice at confirmation.** `bookings-confirmCompletion` creates `payments/{bookingId}` (PENDING) in the same transaction, from the server-held final price and the commission snapshot (split in whole pesewas: commission + technician net = gross).
- **Mobile Money.** `payments-initiate` (the booking's customer) reserves attempt *n* and calls the provider with idempotency key `bookingId:n` (a retried request reuses the attempt; a pending attempt is re-verified before being replaced). The customer approves the prompt on their phone.
- **Webhooks.** `webhooks-payments` verifies the HMAC signature over the raw body (401 otherwise), de-duplicates on `paymentWebhookEvents/{provider_eventId}`, then **re-verifies the reference server-to-server** — the body alone never settles anything — and checks reference, amount and currency against the invoice.
- **Finalisation (one transaction).** Payment SUCCEEDED, booking CUSTOMER_CONFIRMED → PAID (SYSTEM), wallet ledger entries created with deterministic ids (`earning_{bookingId}`, `commission_{bookingId}`, so a duplicate can't post) and the cached wallet balances updated. Already-paid is a no-op.
- **Cash (Decision D5).** The customer chooses cash (if `settings/platform.cashAllowed`); the assigned technician confirms receipt with `payments-confirmCash`; finalisation posts only the COMMISSION_DEBIT, so the balance can go negative (commission owed) and later Mobile Money earnings net it off. Withdrawals while negative are blocked from the Wallet stage on.
- **Reconciliation.** `schedules-reconcilePayments` (every 10 minutes) re-verifies Mobile Money attempts pending longer than 10 minutes.
- **Providers.** Only `integrations/payments/factory.ts` chooses one. The development `MockPaymentProvider` behaves like a real one (pending charges, HMAC-signed webhooks) with sandbox state in `devMockPayments`, and refuses to run outside the Functions emulator; `dev-mockPaymentOutcome` (emulator only) plays the payer's phone. No real provider is connected yet.
- **Rules.** Payments: the customer, the technician and admins read; the attempt log (masked numbers): the payer and admins; wallets and ledgers: the technician and admins. No client writes anywhere in money.

## Cloud Functions build

`firebase.json` points Functions at `apps/functions/dist`, produced by `apps/functions/scripts/build.mjs`: an esbuild bundle (inlining `@serviceflow/*` and zod) plus a generated `package.json` listing only `firebase-admin` and `firebase-functions`. This avoids `workspace:*` dependencies breaking the cloud `npm install`. `src/lib/global-options.ts` must stay the first import in `src/index.ts` so region and instance limits apply to every function.

## Environments

| Environment | Project | Status |
| --- | --- | --- |
| Local | `demo-serviceflow` (emulators only) | Active |
| Dev / Prod | real Firebase projects | Not created — waiting on Decision D3 (region) |

## Stage log

- **Stage 2 — Foundation**: monorepo, shared domain packages, Firebase config (deny-by-default rules, indexes), Functions skeleton with health checks and seed, web and mobile shells reading live services.
- **Stage 11 — Payments**: invoice at confirmation, Mobile Money with signed webhooks + re-verification + reconciliation, cash per D5, ledger entries on payment, payment UI on web and mobile, admin payments page.
- **Stage 10 — Web dashboards**: admin home/KPIs, customers, technician detail, audit log, settings (platform, commission rules, service areas via audited callables), technician web jobs, public information pages.
- **Stage 9 — Technician mobile workflow**: Jobs tab, job screen with countdown and one primary action, quote, call/navigate, one-time location, before/after photos (Storage rules + callable), completion notes, web display of the job record.
- **Stage 8 — Matching**: matching on create, customer choice among stored candidates, re-search, offer and matching expiry sweep, candidate pickers on web and mobile.
- **Stage 7 — Bookings**: server-only booking state machine with history and idempotency receipts, create/cancel/offer response/job steps/quote/confirm callables, admin reassign and price override, booking rules, customer booking pages (web + mobile) and admin bookings.
- **Stage 6 — Technician onboarding and verification**: register/services/verification/review callables, Storage rules for private ID documents, technician rules, web provider + admin review pages, mobile onboarding with photo capture and compression.
- **Stage 5 — Services**: audited admin catalogue callables, admin services page, public services list and detail pages, null-tolerant optional callable inputs.
- **Stage 4 — Users and profiles**: customer profiles and saved addresses (rules-validated client writes), welcome step, profile page, mobile display-name editing.
- **Stage 3 — Authentication**: custom phone OTP → custom token, admin email/password, account records, suspension with audit, `users` rules, web + mobile sign-in, Functions integration tests on the emulators.
