import { Suspense, lazy } from "react";
import { useParams } from "react-router";
import { ServiceList } from "../../features/services/ServiceList";

const LiveServices = lazy(() => import("../../features/services/LiveServices"));
const LiveServiceDetail = lazy(() => import("../../features/services/LiveServiceDetail"));

/** Public catalogue: every service customers can book right now. */
export function ServicesPage() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight text-ink-900">Services</h1>
      <p className="mt-2 max-w-2xl text-ink-600">
        Verified professionals across Accra. Prices are typical ranges — you confirm the final amount before any work starts.
      </p>
      <div className="mt-8">
        <Suspense fallback={<ServiceList state={{ status: "loading" }} />}>
          <LiveServices />
        </Suspense>
      </div>
    </section>
  );
}

/** One service, by its web address (/services/:slug). */
export function ServiceDetailPage() {
  const { slug = "" } = useParams();
  return (
    <section className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <Suspense fallback={<p className="text-ink-600">Loading…</p>}>
        <LiveServiceDetail slug={slug} />
      </Suspense>
    </section>
  );
}
