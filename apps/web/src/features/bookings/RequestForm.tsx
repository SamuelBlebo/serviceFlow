import { PreferredTime, createBookingInput, formatMoneyRange, scheduleProblem } from "@serviceflow/shared";
import { type FormEvent, useState } from "react";
import { Link } from "react-router";
import { Button, SelectField, TextAreaField, TextField } from "../../components/ui";
import type { Service } from "../../lib/admin/catalogue-store";
import type { Address } from "../../lib/profile/customer-store";

export interface RequestValues {
  serviceId: string;
  problemDescription: string;
  addressId: string;
  preferredTime: PreferredTime;
  scheduledAt?: string;
}

const TIME_OPTIONS: Array<{ value: PreferredTime; label: string }> = [
  { value: PreferredTime.ASAP, label: "As soon as possible" },
  { value: PreferredTime.TODAY, label: "Later today" },
  { value: PreferredTime.TOMORROW, label: "Tomorrow" },
  { value: PreferredTime.SCHEDULED, label: "Choose a date and time" },
];

type Field = "serviceId" | "problemDescription" | "addressId" | "scheduledAt";

/**
 * Request a service: what, where (a saved address — its landmark directions
 * go only to the technician who accepts) and when. Validated with the same
 * shared schema and schedule rule the server applies.
 */
export function RequestForm({
  services,
  addresses,
  defaultAddressId,
  initialServiceId,
  now = () => Date.now(),
  busy = false,
  serverError,
  onSubmit,
}: {
  services: Service[];
  addresses: Address[];
  defaultAddressId: string | null;
  initialServiceId?: string;
  now?: () => number;
  busy?: boolean;
  serverError?: string | null;
  onSubmit(values: RequestValues): void;
}) {
  const [serviceId, setServiceId] = useState(() => (services.some((s) => s.id === initialServiceId) ? initialServiceId! : ""));
  const [problem, setProblem] = useState("");
  const [addressId, setAddressId] = useState(defaultAddressId ?? addresses[0]?.id ?? "");
  const [preferredTime, setPreferredTime] = useState<PreferredTime>(PreferredTime.ASAP);
  const [when, setWhen] = useState("");
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});

  const service = services.find((s) => s.id === serviceId);

  function submit(event: FormEvent) {
    event.preventDefault();
    // <input type="datetime-local"> is local time (Ghana is UTC+0); send ISO.
    const scheduledMs = preferredTime === PreferredTime.SCHEDULED && when ? new Date(when).getTime() : null;
    const scheduledAt = scheduledMs !== null && !Number.isNaN(scheduledMs) ? new Date(scheduledMs).toISOString() : undefined;
    const values: RequestValues = { serviceId, problemDescription: problem.trim(), addressId, preferredTime, scheduledAt };

    const next: Partial<Record<Field, string>> = {};
    const parsed = createBookingInput.safeParse({ requestId: "req_validateonly", ...values, addressId: addressId || undefined });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as Field;
        if (field && !next[field]) next[field] = issue.message;
      }
    }
    if (!serviceId) next.serviceId = "Choose a service";
    const timeProblem = scheduleProblem(preferredTime, preferredTime === PreferredTime.SCHEDULED ? scheduledMs : null, now());
    if (timeProblem) next.scheduledAt = timeProblem;
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;
    onSubmit(values);
  }

  if (addresses.length === 0) {
    return (
      <div className="rounded-xl border border-ink-100 bg-white p-5">
        <p className="text-ink-800">Add an address first, so the technician knows where to come.</p>
        <Link to="/app/profile" className="mt-3 inline-block font-medium text-brand-700 hover:text-brand-800">
          Add an address
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      <SelectField
        label="Service"
        value={serviceId}
        onChange={(e) => setServiceId(e.target.value)}
        error={errors.serviceId}
        hint={service ? `Typical price ${formatMoneyRange(service.priceRange.minMinor, service.priceRange.maxMinor)}` : undefined}
      >
        <option value="">Choose a service…</option>
        {services.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </SelectField>

      <TextAreaField
        label="What's the problem?"
        value={problem}
        onChange={(e) => setProblem(e.target.value)}
        maxLength={1000}
        placeholder="e.g. The kitchen sink pipe is leaking under the cabinet"
        error={errors.problemDescription}
      />

      <fieldset>
        <legend className="text-sm font-medium text-ink-900">Where</legend>
        <div className="mt-2 space-y-2">
          {addresses.map((a) => (
            <label key={a.id} className="flex items-start gap-3 rounded-lg border border-ink-100 px-3 py-2.5">
              <input type="radio" name="address" className="mt-1" checked={addressId === a.id} onChange={() => setAddressId(a.id)} />
              <span>
                <span className="font-medium text-ink-900">{a.label}</span>
                <span className="text-ink-600"> — {a.areaName}</span>
                <span className="block text-sm text-ink-500">{a.directions}</span>
              </span>
            </label>
          ))}
        </div>
        {errors.addressId && (
          <p role="alert" className="mt-1.5 text-sm text-danger">
            {errors.addressId}
          </p>
        )}
        <p className="mt-2 text-sm text-ink-500">Your phone number and directions are shared only with the technician who accepts the job.</p>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-medium text-ink-900">When</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {TIME_OPTIONS.map((o) => (
            <label key={o.value} className="flex items-center gap-2 rounded-lg border border-ink-100 px-3 py-2.5">
              <input type="radio" name="when" checked={preferredTime === o.value} onChange={() => setPreferredTime(o.value)} />
              <span className="text-ink-800">{o.label}</span>
            </label>
          ))}
        </div>
        {preferredTime === PreferredTime.SCHEDULED && (
          <div className="mt-3 max-w-xs">
            <TextField label="Date and time" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} error={errors.scheduledAt} />
          </div>
        )}
        {preferredTime !== PreferredTime.SCHEDULED && errors.scheduledAt && (
          <p role="alert" className="mt-1.5 text-sm text-danger">
            {errors.scheduledAt}
          </p>
        )}
      </fieldset>

      {serverError && (
        <p role="alert" className="text-sm text-danger">
          {serverError}
        </p>
      )}
      <Button type="submit" busy={busy}>
        Request a technician
      </Button>
      <p className="text-sm text-ink-500">The technician confirms the final price with you before starting any work.</p>
    </form>
  );
}
