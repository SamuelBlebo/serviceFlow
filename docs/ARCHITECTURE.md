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
- **Not yet:** matching (REQUESTED → MATCHING → OFFERED, candidates, offer expiry) is the next stage; until then new bookings honestly read "Finding a technician". The payment invoice is created at confirmation from the Payments stage on.

## Cloud Functions build

`firebase.json` points Functions at `apps/functions/dist`, produced by `apps/functions/scripts/build.mjs`: an esbuild bundle (inlining `@serviceflow/*` and zod) plus a generated `package.json` listing only `firebase-admin` and `firebase-functions`. This avoids `workspace:*` dependencies breaking the cloud `npm install`. `src/lib/global-options.ts` must stay the first import in `src/index.ts` so region and instance limits apply to every function.

## Environments

| Environment | Project | Status |
| --- | --- | --- |
| Local | `demo-serviceflow` (emulators only) | Active |
| Dev / Prod | real Firebase projects | Not created — waiting on Decision D3 (region) |

## Stage log

- **Stage 2 — Foundation**: monorepo, shared domain packages, Firebase config (deny-by-default rules, indexes), Functions skeleton with health checks and seed, web and mobile shells reading live services.
- **Stage 7 — Bookings**: server-only booking state machine with history and idempotency receipts, create/cancel/offer response/job steps/quote/confirm callables, admin reassign and price override, booking rules, customer booking pages (web + mobile) and admin bookings.
- **Stage 6 — Technician onboarding and verification**: register/services/verification/review callables, Storage rules for private ID documents, technician rules, web provider + admin review pages, mobile onboarding with photo capture and compression.
- **Stage 5 — Services**: audited admin catalogue callables, admin services page, public services list and detail pages, null-tolerant optional callable inputs.
- **Stage 4 — Users and profiles**: customer profiles and saved addresses (rules-validated client writes), welcome step, profile page, mobile display-name editing.
- **Stage 3 — Authentication**: custom phone OTP → custom token, admin email/password, account records, suspension with audit, `users` rules, web + mobile sign-in, Functions integration tests on the emulators.
