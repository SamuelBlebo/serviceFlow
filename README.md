# Home Service

Trusted help, right at your doorstep. A Ghana-first home-services marketplace: **customers** book through WhatsApp, **technicians** work from a dedicated mobile app, **admins** run the platform from a dashboard — all on one backend.

This repo is the **Phase 1 (Foundation) + a WhatsApp-to-booking vertical slice**, per the phased plan below. It is not the full platform yet — see [Roadmap](#roadmap).

## What's actually implemented

- **Database**: a complete Prisma/PostgreSQL schema covering all the core models — users, customer/technician profiles, verification, services, bookings, the full booking state machine, payments, configurable commission, a technician wallet/ledger, payouts, ratings/reviews, disputes, notifications, messages, media, admin audit log, and WhatsApp conversation state. See `packages/database/prisma/schema.prisma`.
- **Backend API** (`apps/backend`, Express + TypeScript): auth (phone+OTP for customers/technicians, email+password for admins, JWT access/refresh), RBAC middleware, services CRUD, technician self-service + admin verification workflow, the booking state machine with server-side transition validation, a deterministic matching engine, a payment provider abstraction (mock provider wired in, ready for Paystack/Flutterwave/Hubtel), configurable commission, a wallet ledger, and a WhatsApp adapter + conversation state machine that drives a customer from "Hi" through to a confirmed booking.
- **Tests**: booking state machine, matching score math, commission split, JWT, RBAC middleware, and HTTP-level auth/validation/role-escalation tests (Vitest + Supertest). 60 tests, all passing.
- **Not yet built in this slice**: the Technician App (React Native/Expo), the Admin Dashboard (web), disputes resolution UI, notifications delivery beyond the mock/log stubs, and real payment/WhatsApp provider credentials. The backend is architected so all of these plug into what's here — see Roadmap.

## Why WhatsApp, not "just a chatbot"

The WhatsApp integration is a thin adapter (`modules/whatsapp/whatsapp-provider.interface.ts`) behind an explicit conversation state machine (`modules/whatsapp/conversation-handlers.ts`) that calls the same Booking/Matching/Commission services the Technician App and Admin Dashboard will call. Swapping WhatsApp providers, or adding a customer-facing web/app surface later, doesn't touch business logic.

```
WhatsApp → WhatsApp Adapter → Conversation Service → Booking/Matching Service → Database
```

## Getting started

Requires Node 20+, pnpm, and PostgreSQL.

```bash
pnpm install
cp .env.example .env        # edit DATABASE_URL and secrets
pnpm db:generate             # generates the Prisma client — REQUIRED before anything else runs
pnpm db:migrate               # creates the database schema
pnpm db:seed                   # seeds the 3 launch services, a global commission rule, and sample Accra technicians
pnpm --filter backend bootstrap:admin   # sets the seeded admin's password from ADMIN_BOOTSTRAP_EMAIL/PASSWORD
pnpm dev                        # starts the backend on :4000 (WHATSAPP_PROVIDER=mock and PAYMENT_PROVIDER=mock by default)
```

Run the test suite (after `db:generate` — the tests import the generated Prisma types/enums):

```bash
pnpm --filter backend test
pnpm --filter @home-service/shared test
```

### Trying the WhatsApp flow without a real WhatsApp Business account

With `WHATSAPP_PROVIDER=mock` (the default), `POST /api/v1/whatsapp/webhook` accepts simplified JSON instead of Meta's webhook shape, so you can walk the whole conversation with curl:

```bash
curl -X POST localhost:4000/api/v1/whatsapp/webhook -H 'Content-Type: application/json' \
  -d '{"from":"0241234567","type":"text","text":"Hi"}'

curl -X POST localhost:4000/api/v1/whatsapp/webhook -H 'Content-Type: application/json' \
  -d '{"from":"0241234567","type":"interactive_reply","interactiveId":"1"}'   # picks service #1

curl -X POST localhost:4000/api/v1/whatsapp/webhook -H 'Content-Type: application/json' \
  -d '{"from":"0241234567","type":"text","text":"Kitchen pipe is leaking"}'

curl -X POST localhost:4000/api/v1/whatsapp/webhook -H 'Content-Type: application/json' \
  -d '{"from":"0241234567","type":"location","location":{"lat":5.6494,"lng":-0.1531}}'

curl -X POST localhost:4000/api/v1/whatsapp/webhook -H 'Content-Type: application/json' \
  -d '{"from":"0241234567","type":"interactive_reply","interactiveId":"1"}'   # "ASAP"

# → booking is created, matched against seeded technicians, and candidates are listed
curl -X POST localhost:4000/api/v1/whatsapp/webhook -H 'Content-Type: application/json' \
  -d '{"from":"0241234567","type":"interactive_reply","interactiveId":"1"}'   # picks a technician → booking OFFERED
```

Outbound messages are logged to the console by the mock provider instead of actually sending WhatsApp messages. Switch `WHATSAPP_PROVIDER=meta_cloud_api` and set the `WHATSAPP_*` env vars to go live — no application code changes needed.

## A note on this sandbox's verification (read if something looks unusual)

This codebase was built in a network-restricted sandbox that blocks `binaries.prisma.sh`, the CDN Prisma's CLI downloads its query/schema engine binaries from. That means `prisma generate` / `prisma migrate` could not be run here — this is a sandbox networking policy, not a problem with your machine; both will work normally in a typical dev/CI environment with normal internet access.

To still verify the work rather than ship it untested, two independent checks were done in this sandbox instead:

1. **The relational schema** was hand-translated to raw SQL and applied directly to a real local PostgreSQL instance — all 25 tables, 18 enums, every foreign key, and a seed-equivalent data set (services, commission, technicians, service areas, a booking) loaded and queried successfully, including the haversine distance-based matching join.
2. **The application code** was typechecked and unit/integration-tested (60 tests) against a temporary, clearly-labeled local stand-in for the generated Prisma client (matching `schema.prisma`'s enums exactly), which surfaced and let us fix several real bugs (a `jsonwebtoken` typing issue, unsafe `req.params` access, an over-broad `declaration: true` in the backend's tsconfig). That stand-in was then removed — `packages/database/src/index.ts` in this repo is the real, final implementation; running `pnpm db:generate` on a normal machine produces the actual generated client the code expects.

Nothing about the sandbox restriction changes what you need to do to run this — it's the standard `pnpm install && pnpm db:generate` any Prisma project requires.

## Architecture

Monorepo, pnpm workspaces:

```
apps/
  backend/                 Express + TypeScript API
    src/
      app.ts, server.ts     Express app assembly / entrypoint
      config/                env validation (zod), logger
      common/                auth+RBAC middleware, error handling, shared HTTP helpers
      modules/
        auth/                 phone+OTP, admin email/password, JWT
        services/              service catalogue (admin-managed, never hard-coded)
        technicians/            technician self-service + admin verification workflow
        matching/                deterministic technician ranking
        bookings/                 booking state machine + service
        payments/                  PaymentProvider abstraction + mock implementation
        commission/                configurable commission resolution/split
        wallet/                     technician earnings ledger (append-only)
        ratings/                     post-booking rating
        whatsapp/                    WhatsAppProvider abstraction + conversation state machine
packages/
  database/                 Prisma schema + generated client (single source of truth for all models)
  shared/                    cross-app utilities: Ghana phone normalization, geo distance, typed errors
```

**Booking state machine** (`modules/bookings/booking-state-machine.ts`) is the single source of truth for which status transitions are legal and who (customer/technician/admin/system) may trigger each one. Every status change in the app goes through it — nothing updates `Booking.status` directly. `REQUESTED → PAID` and similar arbitrary jumps are structurally impossible, not just discouraged.

**Money** is never hard-coded: commission is resolved per booking (technician-specific → service-specific → global → env default, in that precedence order) and snapshotted onto the booking at confirmation time so later admin changes don't rewrite history. The wallet is an append-only ledger (`WalletTransaction`) — balances are a read-optimization derived from it, never written directly.

**Matching** (`modules/matching/matching.service.ts`) only considers `VERIFIED`, currently-available technicians who serve the requested area and are on-shift; ranking itself is a deterministic weighted score (distance, rating, completed jobs, completion rate, cancellation rate, response rate) — no ML, by design, with the scoring function (`computeMatchScore`) kept pure and independently unit-tested.

## Roadmap

Following the spec's own phase ordering:

- **Phase 2 — Technician**: React Native/Expo app consuming `modules/technicians` + `modules/bookings` (the API surface already supports registration, verification submission, availability, service areas, job accept/decline/status updates, wallet, and withdrawals).
- **Phase 5 — Trust**: disputes resolution flow (the `Dispute` model and admin action audit log already exist; needs the customer complaint intake + admin review UI/endpoints).
- **Phase 6 — Payments**: a real Mobile Money provider (Paystack/Flutterwave/Hubtel) implementing `PaymentProvider` — the abstraction, wallet crediting, and payout request/ledger are already in place.
- **Phase 7 — Admin**: the web dashboard, consuming the `/admin` routes already exposed under `services`, `technicians`, and `bookings`.
- **Notifications**: currently a log-only stub at the WhatsApp send layer; needs a real dispatcher fanning out to push/SMS/email per `Notification.channel`.
