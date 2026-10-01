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

## Cloud Functions build

`firebase.json` points Functions at `apps/functions/dist`, produced by `apps/functions/scripts/build.mjs`: an esbuild bundle (inlining `@serviceflow/*` and zod) plus a generated `package.json` listing only `firebase-admin` and `firebase-functions`. This avoids `workspace:*` dependencies breaking the cloud `npm install`. `src/lib/global-options.ts` must stay the first import in `src/index.ts` so region and instance limits apply to every function.

## Environments

| Environment | Project | Status |
| --- | --- | --- |
| Local | `demo-serviceflow` (emulators only) | Active |
| Dev / Prod | real Firebase projects | Not created — waiting on Decision D3 (region) |

## Stage log

- **Stage 2 — Foundation**: monorepo, shared domain packages, Firebase config (deny-by-default rules, indexes), Functions skeleton with health checks and seed, web and mobile shells reading live services.
