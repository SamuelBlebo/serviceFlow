import { firstName, isOpenBooking } from "@serviceflow/shared";
import { Link } from "react-router";
import { StatusBadge, whenText } from "../../features/bookings/BookingParts";
import { watchMyBookings } from "../../lib/bookings/booking-store";
import { useCustomerProfile } from "../../lib/profile/CustomerProfileProvider";
import { useMyBookings } from "./BookingPages";

/** Customer dashboard: open bookings first, then the default address. */
export function CustomerHome({ watchMine = watchMyBookings }: { watchMine?: typeof watchMyBookings } = {}) {
  const { state } = useCustomerProfile();
  const { list } = useMyBookings(state.status === "ready" ? state.uid : null, watchMine);
  if (state.status !== "ready" || !state.customer) return null;
  const { customer, addresses } = state;
  const defaultAddress = addresses.find((a) => a.id === customer.defaultAddressId);
  const open = (list ?? []).filter((b) => isOpenBooking(b.status));

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Welcome, {firstName(customer.fullName)}</h1>
        <Link to="/app/request" className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700">
          Request a service
        </Link>
      </div>

      <section className="rounded-xl border border-ink-100 bg-white p-5" aria-labelledby="open-bookings">
        <h2 id="open-bookings" className="text-sm font-medium uppercase tracking-wide text-ink-500">
          Open bookings
        </h2>
        {list === null ? (
          <p className="mt-2 text-ink-500">Loading…</p>
        ) : open.length === 0 ? (
          <p className="mt-2 text-ink-700">No open bookings. Need something fixed? Request a service and we'll find a verified technician.</p>
        ) : (
          <ul className="mt-3 divide-y divide-ink-100">
            {open.map((b) => (
              <li key={b.id}>
                <Link to={`/app/bookings/${b.id}`} className="flex flex-wrap items-center justify-between gap-3 py-3 hover:text-brand-800">
                  <span>
                    <span className="block font-medium text-ink-900">{b.serviceSnapshot.name}</span>
                    <span className="text-sm text-ink-500">{whenText(b)}</span>
                  </span>
                  <StatusBadge status={b.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

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
    </div>
  );
}
