import { Suspense, lazy } from "react";
import { Link } from "react-router";
import { ServiceList } from "../../features/services/ServiceList";

// Firestore loads in its own chunk after the page shell renders (see LiveServices).
const LiveServices = lazy(() => import("../../features/services/LiveServices"));

const STEPS = [
  { title: "Tell us what's wrong", body: "Pick a service, describe the problem and share your location — on the web or WhatsApp." },
  { title: "Get a verified professional", body: "We match you with nearby, ID-verified technicians ranked by rating and reliability." },
  { title: "Track, confirm and pay", body: "Follow the job live, confirm when it's done and pay securely with Mobile Money." },
];

export function LandingPage() {
  return (
    <>
      <section className="border-b border-ink-100 bg-gradient-to-b from-brand-50 to-white">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <p className="text-sm font-medium uppercase tracking-wide text-brand-700">Accra · Tema · Kasoa</p>
          <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight text-ink-900 sm:text-5xl">
            Trusted service professionals, booked in minutes.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-ink-600">
            Plumbers, electricians and AC technicians who are ID-verified, rated by your neighbours and paid only when
            the job is done.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              to="/app/request"
              className="rounded-lg bg-brand-600 px-5 py-3 text-center font-medium text-white hover:bg-brand-700"
            >
              Request a service
            </Link>
            <Link
              to="/become-a-provider"
              className="rounded-lg border border-ink-200 bg-white px-5 py-3 text-center font-medium text-ink-900 hover:border-ink-300"
            >
              Become a provider
            </Link>
          </div>
        </div>
      </section>

      <section aria-labelledby="services-heading" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 id="services-heading" className="text-2xl font-semibold tracking-tight text-ink-900">
              Services
            </h2>
            <p className="mt-2 text-ink-600">Prices are typical ranges — you confirm the final amount before paying.</p>
          </div>
        </div>
        <div className="mt-8">
          <Suspense fallback={<ServiceList state={{ status: "loading" }} />}>
            <LiveServices />
          </Suspense>
        </div>
      </section>

      <section aria-labelledby="how-heading" className="border-t border-ink-100 bg-ink-50">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 id="how-heading" className="text-2xl font-semibold tracking-tight text-ink-900">
            How it works
          </h2>
          <ol className="mt-8 grid gap-6 md:grid-cols-3">
            {STEPS.map((step, i) => (
              <li key={step.title} className="rounded-xl border border-ink-100 bg-white p-6">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white">
                  {i + 1}
                </span>
                <h3 className="mt-4 font-semibold text-ink-900">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-600">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </>
  );
}
