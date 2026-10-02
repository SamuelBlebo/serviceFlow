import { formatMoneyRange } from "@serviceflow/shared";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { type Service, watchPublicService } from "../../lib/admin/catalogue-store";

export type ServiceDetailState = { status: "loading" } | { status: "error" } | { status: "ready"; service: Service | null };

/** Presentational detail view — hidden or unknown services read as "not found". */
export function ServiceDetailView({ state }: { state: ServiceDetailState }) {
  if (state.status === "loading") return <p className="text-ink-600" aria-busy="true">Loading…</p>;
  if (state.status === "error") {
    return (
      <p role="alert" className="text-ink-700">
        We couldn't load this service. Check your connection and try again.
      </p>
    );
  }
  if (!state.service) {
    return (
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Service not available</h1>
        <p className="mt-2 text-ink-600">This service doesn't exist or isn't offered right now.</p>
        <Link to="/services" className="mt-4 inline-block font-medium text-brand-700 hover:text-brand-800">
          See all services
        </Link>
      </div>
    );
  }
  const { service } = state;
  return (
    <article>
      <h1 className="text-3xl font-semibold tracking-tight text-ink-900">{service.name}</h1>
      {service.description && <p className="mt-3 text-lg leading-relaxed text-ink-600">{service.description}</p>}
      <p className="mt-6 text-ink-700">
        Typical price{" "}
        <strong className="font-semibold text-ink-900">{formatMoneyRange(service.priceRange.minMinor, service.priceRange.maxMinor)}</strong>
      </p>
      <p className="mt-1 text-sm text-ink-500">Your technician confirms the final price before work starts.</p>
      <Link to={`/app/request?service=${encodeURIComponent(service.id)}`} className="mt-8 inline-block rounded-lg bg-brand-600 px-5 py-3 font-medium text-white hover:bg-brand-700">
        Request {service.name.toLowerCase()}
      </Link>
    </article>
  );
}

/** Lazily loaded (default export) so public pages don't pull Firestore into the first chunk. */
export default function LiveServiceDetail({ slug }: { slug: string }) {
  const [state, setState] = useState<ServiceDetailState>({ status: "loading" });
  useEffect(
    () =>
      watchPublicService(
        slug,
        (service) => setState({ status: "ready", service }),
        () => setState({ status: "error" }),
      ),
    [slug],
  );
  return <ServiceDetailView state={state} />;
}
