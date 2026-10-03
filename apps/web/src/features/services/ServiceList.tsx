import { formatMoneyRange } from "@serviceflow/shared";
import { Link } from "react-router";
import type { ActiveServicesState } from "./useActiveServices";

/**
 * Presentational list of services — every state (loading, error, empty,
 * ready) is rendered explicitly. Pure props, so it is tested without Firebase.
 */
export function ServiceList({ state, onRetry }: { state: ActiveServicesState; onRetry?: () => void }) {
  if (state.status === "loading") {
    return (
      <ul aria-busy="true" aria-label="Loading services" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <li key={i} className="h-36 animate-pulse rounded-xl border border-ink-100 bg-ink-50" />
        ))}
      </ul>
    );
  }

  if (state.status === "error") {
    return (
      <div role="alert" className="rounded-xl border border-danger/30 bg-danger/5 p-6">
        <p className="font-medium text-ink-900">{state.message}</p>
        <p className="mt-1 text-sm text-ink-600">Check your connection and try again.</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-4 rounded-lg bg-ink-900 px-4 py-2 text-sm font-medium text-white hover:bg-ink-800"
          >
            Try again
          </button>
        )}
      </div>
    );
  }

  if (state.services.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-ink-200 p-8 text-center">
        <p className="font-medium text-ink-900">No services are available yet.</p>
        <p className="mt-1 text-sm text-ink-600">We're onboarding professionals in your area. Check back soon.</p>
      </div>
    );
  }

  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {state.services.map((service) => (
        <li
          key={service.id}
          className="flex flex-col rounded-xl border border-ink-100 bg-white p-6 transition-colors hover:border-brand-300"
        >
          <h3 className="text-lg font-semibold text-ink-900">
            <Link to={`/services/${service.id}`} className="hover:text-brand-700">
              {service.name}
            </Link>
          </h3>
          <p className="mt-2 flex-1 text-sm leading-relaxed text-ink-600">{service.description}</p>
          <p className="mt-4 text-sm text-ink-500">
            Typical price{" "}
            <span className="font-medium text-ink-900">
              {formatMoneyRange(service.priceRange.minMinor, service.priceRange.maxMinor)}
            </span>
          </p>
        </li>
      ))}
    </ul>
  );
}
