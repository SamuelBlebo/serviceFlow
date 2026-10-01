# ServiceFlow

A Ghana-first platform that makes it easy for customers to find, book, track and pay trusted service professionals — and gives those professionals simple tools to manage jobs and earnings.

**One Firebase backend. One source of truth. Web + mobile + WhatsApp working together.**

> **Status: Stage 4 (Users and profiles) complete.** Phone and admin sign-in, account suspension, and customer profiles with Ghana-style saved addresses (landmark directions + GhanaPost GPS) run on the local Firebase emulators. Bookings, technician onboarding, payments and more are built stage by stage — see [SERVICEFLOW_MIGRATION_PLAN.md](SERVICEFLOW_MIGRATION_PLAN.md).

## Repository layout

```text
apps/
  web/          React + Vite + TypeScript + React Router + Tailwind — public site, customer, technician and admin areas
  mobile/       Expo + Expo Router + React Native Firebase — technician-first app
  functions/    Firebase Cloud Functions v2 — the trusted backend (bundled with esbuild into dist/)
  backend/      LEGACY Express API — frozen; removed domain by domain (docs/LEGACY_REMOVAL.md)
packages/
  shared/       Pure domain logic + types + zod schemas: booking state machine, matching, commission,
                wallet ledger, money (pesewas), phone, geo, time zones, design tokens
  firebase/     SDK-agnostic Firebase contract: collection paths, callable registry, doc converters
  database/     LEGACY Prisma schema — removed with apps/backend
firebase/       Firestore + Storage security rules, indexes, and rules tests
docs/           ARCHITECTURE.md, LEGACY_REMOVAL.md
```

How the pieces fit together: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Prerequisites

- **Node.js 22+** and **pnpm 11** (`corepack enable` picks up the pinned version)
- **Java JDK 21+** — required by the Firebase Emulator Suite (e.g. [Eclipse Temurin 21](https://adoptium.net/))
- For the mobile app on a device: Android Studio / an Android emulator (or Xcode on macOS). The app uses React Native Firebase, so it runs in an **Expo development build**, not Expo Go.

The Firebase CLI is installed as a dev dependency — no global install needed.

## Quick start (everything runs locally — no Firebase account needed)

```bash
pnpm install

# Terminal 1 — builds the functions bundle, then starts Auth, Firestore, Functions,
# Storage and Hosting emulators (Emulator UI: http://127.0.0.1:4000)
pnpm emulators

# Terminal 2 — seed services, 17 Accra service areas, settings and sample accounts
pnpm seed

# Optional — create a local administrator (prints a generated password)
pnpm bootstrap:admin

# Web app on http://localhost:5173 (copy apps/web/.env.example to apps/web/.env first)
pnpm dev:web
```

The project id is `demo-serviceflow`. Firebase treats `demo-*` projects as emulator-only, so local work can never touch real cloud resources.

### Signing in locally

- **Customers / technicians** — go to `/login` and enter any Ghanaian number (e.g. `024 555 0101`). With the emulator's mock OTP sender, the 6-digit code is shown on the verify screen ("Local emulator code") and in the Functions logs. This dev code is returned **only** inside the Functions emulator; outside it the mock sender refuses to run. Seeded technicians sign in with `024 100 0001` … `024 100 0004`; the seeded customer (with a saved address) with `020 123 4567`. A brand-new number goes through a one-time welcome step (name + optional main address).
- **Admins** — run `pnpm bootstrap:admin`, then sign in at `/admin/login` with the printed email and password. Admin sessions last for the browser tab and end after 30 minutes of inactivity.

### Mobile

```bash
cp apps/mobile/.env.example apps/mobile/.env
pnpm --filter @serviceflow/mobile android   # first time: builds and installs the development client
pnpm dev:mobile                              # afterwards: start Metro for the dev client
```

The Android emulator reaches the host's emulators at `10.0.2.2`; for a physical phone set `EXPO_PUBLIC_EMULATOR_HOST` to your computer's LAN IP. App identifiers (`dev.serviceflow.app`) and the bundled Firebase config files are **development placeholders**.

## Checks

| Command | What it runs |
| --- | --- |
| `pnpm typecheck` | TypeScript across every package (including legacy) |
| `pnpm test` | Unit/component tests: shared, firebase contract, functions, web, mobile, legacy API |
| `pnpm test:rules` | Firestore + Storage security rules tests against the emulators (needs Java) |
| `pnpm test:integration` | Cloud Functions integration tests (OTP sign-in, suspension, callables over HTTP) against the Auth, Firestore and Functions emulators (needs Java) |
| `pnpm build` | Web production build + bundled Cloud Functions |
| `pnpm --filter @serviceflow/mobile bundle:check` | Compiles the Android JS bundle with `expo export` |

CI runs all of these on every push and pull request (`.github/workflows/ci.yml`).

## Configuration & secrets

- `apps/web/.env.example`, `apps/mobile/.env.example`: public client identifiers and emulator flags only.
- `apps/functions/.env.example`: non-secret Functions parameters. **Secrets** (payment keys, WhatsApp tokens) live in Secret Manager via `firebase functions:secrets:set` and are only ever read by Cloud Functions.
- Nothing secret is committed; `.env*` files other than examples are git-ignored.

## Legacy API

The original Express + Prisma API lives in `apps/backend` and `packages/database`. It is **frozen** (no new features), still typechecks and its 45 tests still run as part of `pnpm test`, and it will be deleted domain by domain as each Firebase replacement lands. Running it still needs PostgreSQL — see the root `.env.example` and `pnpm dev:legacy`.
