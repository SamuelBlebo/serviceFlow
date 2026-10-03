import { PROFILE_LIMITS, type AddressValues, customerProfileInput, formatGhanaPhoneForDisplay } from "@serviceflow/shared";
import { type FormEvent, useState } from "react";
import { Button, Card, TextField } from "../../components/ui";
import { AddressForm } from "../../features/profile/AddressForm";
import { useAuth } from "../../lib/auth/AuthProvider";
import { messageFromError } from "../../lib/errors";
import { useCustomerProfile } from "../../lib/profile/CustomerProfileProvider";
import type { Address, ServiceArea } from "../../lib/profile/customer-store";

/** Customer profile: name, phone (read-only) and saved addresses. */
export function ProfilePage() {
  const { state } = useCustomerProfile();
  if (state.status !== "ready" || !state.customer) return null; // RequireCustomerProfile handles other states

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Profile</h1>
      <PersonalDetails uid={state.uid} fullName={state.customer.fullName} />
      <Addresses />
    </div>
  );
}

function PersonalDetails({ uid, fullName }: { uid: string; fullName: string }) {
  const { session } = useAuth();
  const { store } = useCustomerProfile();
  const [name, setName] = useState(fullName);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const phone = session.status === "signedIn" && session.user.phone ? formatGhanaPhoneForDisplay(session.user.phone) : "—";

  async function save(event: FormEvent) {
    event.preventDefault();
    const parsed = customerProfileInput.safeParse({ fullName: name });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Enter your name");
      return;
    }
    setError(null);
    setStatus("saving");
    try {
      await store.updateCustomerName(uid, parsed.data.fullName);
      setName(parsed.data.fullName);
      setStatus("saved");
    } catch (err) {
      setError(messageFromError(err));
      setStatus("idle");
    }
  }

  return (
    <Card title="Personal details">
      <form onSubmit={save} noValidate className="space-y-4">
        <TextField
          label="Full name"
          value={name}
          autoComplete="name"
          onChange={(e) => {
            setName(e.target.value);
            setStatus("idle");
          }}
          error={error}
        />
        <div>
          <p className="text-sm font-medium text-ink-900">Phone number</p>
          <p className="mt-1 text-ink-700">{phone}</p>
          <p className="mt-1 text-sm text-ink-500">This is the number you sign in with.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button type="submit" busy={status === "saving"} disabled={name.trim() === fullName}>
            Save name
          </Button>
          {status === "saved" && (
            <span role="status" className="text-sm text-brand-700">
              Saved
            </span>
          )}
        </div>
      </form>
    </Card>
  );
}

function Addresses() {
  const { state, store } = useCustomerProfile();
  const [editing, setEditing] = useState<"new" | string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  if (state.status !== "ready" || !state.customer) return null;
  const { uid, customer, addresses, areas } = state;

  // Default first, then oldest first.
  const ordered = [...addresses].sort((a, b) => Number(b.id === customer.defaultAddressId) - Number(a.id === customer.defaultAddressId));
  const atLimit = addresses.length >= PROFILE_LIMITS.maxSavedAddresses;

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      setEditing(null);
      setConfirmDelete(null);
    } catch (err) {
      setError(messageFromError(err));
    } finally {
      setBusy(false);
    }
  }

  const saveNew = (values: AddressValues, area: ServiceArea) =>
    run(() => store.saveAddress(uid, values, area, { makeDefault: customer.defaultAddressId === null }));
  const saveExisting = (address: Address) => (values: AddressValues, area: ServiceArea) =>
    run(() => store.saveAddress(uid, values, area, { existing: { id: address.id, createdAt: address.createdAt } }));

  return (
    <Card
      title="Saved addresses"
      action={
        editing === null && (
          <Button variant="secondary" onClick={() => setEditing("new")} disabled={atLimit}>
            Add address
          </Button>
        )
      }
    >
      {atLimit && <p className="mb-4 text-sm text-ink-500">You can save up to {PROFILE_LIMITS.maxSavedAddresses} addresses.</p>}
      {error && (
        <p role="alert" className="mb-4 text-sm text-danger">
          {error}
        </p>
      )}

      {editing === "new" && (
        <div className="mb-6 rounded-lg border border-ink-100 p-4">
          <AddressForm areas={areas} busy={busy} onSubmit={saveNew} onCancel={() => setEditing(null)} />
        </div>
      )}

      {ordered.length === 0 && editing !== "new" ? (
        <p className="text-ink-600">No saved addresses yet. Add one so technicians can find you quickly.</p>
      ) : (
        <ul className="divide-y divide-ink-100">
          {ordered.map((address) => {
            const isDefault = address.id === customer.defaultAddressId;
            if (editing === address.id) {
              return (
                <li key={address.id} className="py-4">
                  <AddressForm
                    areas={areas}
                    initial={address}
                    busy={busy}
                    onSubmit={saveExisting(address)}
                    onCancel={() => setEditing(null)}
                  />
                </li>
              );
            }
            return (
              <li key={address.id} className="py-4" data-testid={`address-${address.id}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-ink-900">{address.label}</p>
                  {isDefault && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-800">Default</span>}
                </div>
                <p className="mt-1 text-sm text-ink-700">
                  {address.areaName} · {address.directions}
                </p>
                {address.ghanaPostGps && <p className="mt-0.5 font-mono text-sm text-ink-500">{address.ghanaPostGps}</p>}
                {address.notes && <p className="mt-0.5 text-sm text-ink-500">Note: {address.notes}</p>}
                <div className="mt-2 flex flex-wrap gap-1">
                  <Button variant="ghost" className="px-2 py-1" onClick={() => setEditing(address.id)} disabled={busy}>
                    Edit
                  </Button>
                  {!isDefault && (
                    <Button variant="ghost" className="px-2 py-1" onClick={() => run(() => store.setDefaultAddress(uid, address.id))} disabled={busy}>
                      Make default
                    </Button>
                  )}
                  {confirmDelete === address.id ? (
                    <span className="flex items-center gap-1">
                      <span className="text-sm text-ink-700">Delete this address?</span>
                      <Button variant="ghost" className="px-2 py-1 text-danger" busy={busy} onClick={() => run(() => store.deleteAddress(uid, address.id, customer, addresses))}>
                        Yes, delete
                      </Button>
                      <Button variant="ghost" className="px-2 py-1" onClick={() => setConfirmDelete(null)} disabled={busy}>
                        Keep
                      </Button>
                    </span>
                  ) : (
                    <Button variant="ghost" className="px-2 py-1" onClick={() => setConfirmDelete(address.id)} disabled={busy}>
                      Delete
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
