import { formatMoneyRange } from "@serviceflow/shared";
import { useEffect, useState } from "react";
import { Button, Card, TextField } from "../../components/ui";
import { type ServiceFormValues, ServiceForm } from "../../features/catalogue/ServiceForm";
import { type CatalogueStore, type Service, catalogueStore, watchAllServices } from "../../lib/admin/catalogue-store";
import { FullPageSpinner } from "../../lib/auth/guards";
import { messageFromError } from "../../lib/errors";
import { newRequestId } from "../../lib/request-id";

type Editing = { mode: "new"; requestId: string } | { mode: "edit"; service: Service; requestId: string } | null;

/**
 * Admin service catalogue: every service (visible and hidden), create, edit,
 * hide/show. All writes go through audited callables; the list updates live.
 */
export function AdminServicesPage({
  store = catalogueStore,
  watch = watchAllServices,
}: {
  store?: CatalogueStore;
  watch?: typeof watchAllServices;
} = {}) {
  const [services, setServices] = useState<Service[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => watch(setServices, () => setLoadError("We couldn't load the catalogue. Check your connection.")), [watch]);

  if (loadError) return <p role="alert" className="mx-auto max-w-4xl px-4 py-10 text-ink-700">{loadError}</p>;
  if (!services) return <FullPageSpinner />;

  async function save(values: ServiceFormValues) {
    if (!editing) return;
    setBusy(true);
    setError(null);
    try {
      await store.upsertService({
        requestId: editing.requestId, // same id for retries of this submission
        serviceId: editing.mode === "edit" ? editing.service.id : undefined,
        ...values,
      });
      setEditing(null);
    } catch (err) {
      setError(messageFromError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Services</h1>
          <p className="mt-1 text-ink-600">What customers can book. Hidden services stay in history but can't be booked.</p>
        </div>
        {!editing && (
          <Button
            onClick={() => {
              setError(null);
              setEditing({ mode: "new", requestId: newRequestId() });
            }}
          >
            Add service
          </Button>
        )}
      </div>

      {editing && (
        <Card title={editing.mode === "new" ? "New service" : `Edit ${editing.service.name}`}>
          <ServiceForm
            key={editing.requestId}
            editing={editing.mode === "edit" ? editing.service.id : undefined}
            initial={editing.mode === "edit" ? editing.service : undefined}
            busy={busy}
            serverError={error}
            onSubmit={(values) => void save(values)}
            onCancel={() => setEditing(null)}
          />
        </Card>
      )}

      {services.length === 0 ? (
        <p className="rounded-xl border border-dashed border-ink-200 p-8 text-center text-ink-600">No services yet. Add the first one.</p>
      ) : (
        <ul className="divide-y divide-ink-100 rounded-xl border border-ink-100 bg-white">
          {services.map((service) => (
            <ServiceRow
              key={service.id}
              service={service}
              store={store}
              disabled={busy || editing !== null}
              onEdit={() => {
                setError(null);
                setEditing({ mode: "edit", service, requestId: newRequestId() });
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function ServiceRow({ service, store, disabled, onEdit }: { service: Service; store: CatalogueStore; disabled: boolean; onEdit(): void }) {
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [requestId, setRequestId] = useState(newRequestId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      await store.setServiceActive({ requestId, serviceId: service.id, isActive: !service.isActive, reason: reason.trim() || undefined });
      setConfirming(false);
      setReason("");
      setRequestId(newRequestId()); // the next toggle is a new intent
    } catch (err) {
      setError(messageFromError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="p-4 sm:p-5" data-testid={`service-${service.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-ink-900">{service.name}</p>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${service.isActive ? "bg-brand-50 text-brand-800" : "bg-ink-100 text-ink-600"}`}
            >
              {service.isActive ? "Visible" : "Hidden"}
            </span>
          </div>
          <p className="mt-1 text-sm text-ink-600">
            {formatMoneyRange(service.priceRange.minMinor, service.priceRange.maxMinor)} · /services/{service.id} · order {service.sortOrder}
          </p>
          {service.description && <p className="mt-1 text-sm text-ink-500">{service.description}</p>}
        </div>
        {!confirming && (
          <div className="flex gap-1">
            <Button variant="ghost" className="px-2 py-1" onClick={onEdit} disabled={disabled}>
              Edit
            </Button>
            <Button variant="ghost" className="px-2 py-1" onClick={() => setConfirming(true)} disabled={disabled}>
              {service.isActive ? "Hide" : "Show"}
            </Button>
          </div>
        )}
      </div>
      {confirming && (
        <div className="mt-3 space-y-3 rounded-lg bg-ink-50 p-3">
          <p className="text-sm text-ink-800">
            {service.isActive
              ? "Hide this service? Customers won't be able to book it. Existing bookings are not affected."
              : "Show this service again? Customers will be able to book it."}
          </p>
          <TextField label="Reason (optional, kept in the audit log)" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button onClick={() => void toggle()} busy={busy}>
              {service.isActive ? "Hide service" : "Show service"}
            </Button>
            <Button variant="secondary" onClick={() => setConfirming(false)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}
