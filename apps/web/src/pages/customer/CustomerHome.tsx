import { firstName } from "@serviceflow/shared";
import { Link } from "react-router";
import { useCustomerProfile } from "../../lib/profile/CustomerProfileProvider";

/** Customer dashboard (placeholder content until the Bookings stage). */
export function CustomerHome() {
  const { state } = useCustomerProfile();
  if (state.status !== "ready" || !state.customer) return null;
  const { customer, addresses } = state;
  const defaultAddress = addresses.find((a) => a.id === customer.defaultAddressId);

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Welcome, {firstName(customer.fullName)}</h1>
      <section className="rounded-xl border border-ink-100 bg-white p-5">
        <h2 className="text-sm font-medium uppercase tracking-wide text-ink-500">Default address</h2>
        {defaultAddress ? (
          <p className="mt-2 text-ink-800">
            <span className="font-medium">{defaultAddress.label}</span> — {defaultAddress.areaName}, {defaultAddress.directions}
          </p>
        ) : (
          <p className="mt-2 text-ink-700">No address saved yet.</p>
        )}
        <Link to="/app/profile" className="mt-3 inline-block text-sm font-medium text-brand-700 hover:text-brand-800">
          Manage profile and addresses
        </Link>
      </section>
      <p className="rounded-lg border border-ink-100 bg-ink-50 px-4 py-3 text-sm text-ink-600">
        Requesting a service and tracking bookings arrive in the <strong className="font-medium text-ink-900">Bookings</strong> stage.
      </p>
    </div>
  );
}
