import { Link } from "react-router";

/**
 * Honest placeholder for routes whose content arrives in a later stage.
 * Each one names the stage, so nothing pretends to work before it does.
 */
export function PlaceholderPage({ title, stage, children }: { title: string; stage: string; children?: React.ReactNode }) {
  return (
    <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight text-ink-900">{title}</h1>
      {children && <div className="mt-4 text-lg leading-relaxed text-ink-600">{children}</div>}
      <p className="mt-8 rounded-lg border border-ink-100 bg-ink-50 px-4 py-3 text-sm text-ink-600">
        This page is being built in the <strong className="font-medium text-ink-900">{stage}</strong> stage.
      </p>
      <Link to="/" className="mt-6 inline-block text-sm font-medium text-brand-700 hover:text-brand-800">
        ← Back to home
      </Link>
    </section>
  );
}

export function NotFoundPage() {
  return (
    <section className="mx-auto max-w-3xl px-4 py-24 text-center sm:px-6">
      <p className="text-sm font-medium text-brand-700">404</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink-900">We couldn't find that page.</h1>
      <Link to="/" className="mt-6 inline-block font-medium text-brand-700 hover:text-brand-800">
        Go to the homepage
      </Link>
    </section>
  );
}
