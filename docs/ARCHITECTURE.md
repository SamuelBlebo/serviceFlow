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

## Cloud Functions build

`firebase.json` points Functions at `apps/functions/dist`, produced by `apps/functions/scripts/build.mjs`: an esbuild bundle (inlining `@serviceflow/*` and zod) plus a generated `package.json` listing only `firebase-admin` and `firebase-functions`. This avoids `workspace:*` dependencies breaking the cloud `npm install`. `src/lib/global-options.ts` must stay the first import in `src/index.ts` so region and instance limits apply to every function.

## Environments

| Environment | Project | Status |
| --- | --- | --- |
| Local | `demo-serviceflow` (emulators only) | Active |
| Dev / Prod | real Firebase projects | Not created — waiting on Decision D3 (region) |

## Stage log

- **Stage 2 — Foundation**: monorepo, shared domain packages, Firebase config (deny-by-default rules, indexes), Functions skeleton with health checks and seed, web and mobile shells reading live services.
- **Stage 4 — Users and profiles**: customer profiles and saved addresses (rules-validated client writes), welcome step, profile page, mobile display-name editing.
- **Stage 3 — Authentication**: custom phone OTP → custom token, admin email/password, account records, suspension with audit, `users` rules, web + mobile sign-in, Functions integration tests on the emulators.
