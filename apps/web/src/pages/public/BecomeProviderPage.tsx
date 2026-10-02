import { Link } from "react-router";
import { useAuth } from "../../lib/auth/AuthProvider";

const STEPS = [
  { title: "Register", body: "Sign in with your phone number and tell us your name and experience." },
  { title: "Choose your work", body: "Pick your services, the Accra areas you cover and your working hours." },
  { title: "Get verified", body: "Upload a photo of your Ghana Card (or other ID) and a selfie. We check every provider." },
  { title: "Receive jobs", body: "Go online and get requests from customers near you. Get paid by Mobile Money." },
];

/** Public recruitment page for service providers. */
export function BecomeProviderPage() {
  const { session } = useAuth();
  const isTech = session.status === "signedIn" && session.capabilities.tech;
  const target = isTech ? "/tech" : session.status === "signedIn" ? "/tech/register" : "/login?next=%2Ftech%2Fregister";

  return (
    <section className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
      <p className="text-sm font-medium uppercase tracking-wide text-brand-700">For plumbers, electricians, AC technicians and more</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight text-ink-900">Grow your work with ServiceFlow</h1>
      <p className="mt-4 max-w-2xl text-lg text-ink-600">Verified providers get jobs from customers in their area, with clear prices and Mobile Money payouts.</p>
      <Link to={target} className="mt-8 inline-block rounded-lg bg-brand-600 px-5 py-3 font-medium text-white hover:bg-brand-700">
        {isTech ? "Go to your provider dashboard" : "Start registration"}
      </Link>
      <ol className="mt-12 grid gap-4 sm:grid-cols-2">
        {STEPS.map((s, i) => (
          <li key={s.title} className="rounded-xl border border-ink-100 bg-white p-5">
            <span className="text-sm font-semibold text-brand-700">Step {i + 1}</span>
            <h2 className="mt-1 font-semibold text-ink-900">{s.title}</h2>
            <p className="mt-1 text-sm text-ink-600">{s.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
