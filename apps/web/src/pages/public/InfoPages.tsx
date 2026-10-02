import type { ReactNode } from "react";
import { Link } from "react-router";

function Info({ title, lead, children }: { title: string; lead: string; children: ReactNode }) {
  return (
    <section className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
      <h1 className="text-4xl font-semibold tracking-tight text-ink-900">{title}</h1>
      <p className="mt-4 text-lg text-ink-600">{lead}</p>
      <div className="mt-10 space-y-6 text-ink-700">{children}</div>
    </section>
  );
}

const STEPS = [
  { title: "Tell us what's wrong", body: "Choose a service, describe the problem and pick one of your saved addresses — landmark directions welcome." },
  { title: "Choose your technician", body: "We recommend up to three verified providers near you, ranked by distance, rating and reliability. You choose who gets the job." },
  { title: "Agree the price before any work", body: "Your technician quotes within the service's price range on site. Nothing starts until you accept." },
  { title: "Track the job live", body: "See when your technician is on the way, has arrived and has finished — with before and after photos." },
  { title: "Confirm when you're happy", body: "The job closes only when you confirm the work is done." },
];

/** `/how-it-works` */
export function HowItWorksPage() {
  return (
    <Info title="How ServiceFlow works" lead="Trusted, verified professionals in Accra — booked in minutes, with the price agreed before anyone starts.">
      <ol className="space-y-5">
        {STEPS.map((s, i) => (
          <li key={s.title} className="flex gap-4">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-600 font-semibold text-white">{i + 1}</span>
            <div>
              <h2 className="font-semibold text-ink-900">{s.title}</h2>
              <p className="mt-1">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <p>
        Every provider is checked against their Ghana Card (or other ID) and a selfie before they can receive jobs.{" "}
        <Link to="/services" className="font-medium text-brand-700">
          Browse services
        </Link>{" "}
        or{" "}
        <Link to="/become-a-provider" className="font-medium text-brand-700">
          become a provider
        </Link>
        .
      </p>
    </Info>
  );
}

/** `/about` */
export function AboutPage() {
  return (
    <Info title="About ServiceFlow" lead="We connect households and businesses in Ghana with skilled, verified tradespeople — plumbers, electricians, AC technicians and more.">
      <p>
        Finding someone reliable shouldn't depend on who you know. ServiceFlow verifies every provider's identity, shows their track record, and keeps the price
        conversation honest: a typical range up front, an agreed price before any work, and a record of the job afterwards.
      </p>
      <p>
        For providers, ServiceFlow brings customers nearby, a clear way to quote, and a record of every job done — built for real conditions: low-end phones,
        prepaid data and patchy connections.
      </p>
    </Info>
  );
}

/** `/contact` */
export function ContactPage() {
  return (
    <Info title="Contact us" lead="Questions about a booking, becoming a provider or working with us? We're happy to help.">
      <p>
        If you have a booking, the quickest way to reach us is from the booking page after signing in — your details are already there. For anything else,
        write to us and we'll get back to you within one working day.
      </p>
      <p className="rounded-lg border border-ink-100 bg-ink-50 px-4 py-3 text-sm text-ink-600">
        Support phone and email are published here once ServiceFlow launches; this is a development build.
      </p>
    </Info>
  );
}
