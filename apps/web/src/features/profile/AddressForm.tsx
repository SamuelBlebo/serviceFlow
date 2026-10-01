import { ADDRESS_LABEL_SUGGESTIONS, type AddressValues, addressInput } from "@serviceflow/shared";
import { type FormEvent, useState } from "react";
import { Button, SelectField, TextAreaField, TextField } from "../../components/ui";
import type { ServiceArea } from "../../lib/profile/customer-store";

export interface AddressFormInitial {
  label: string;
  areaId: string;
  directions: string;
  ghanaPostGps: string | null;
  notes: string | null;
}

type FieldErrors = Partial<Record<keyof AddressFormInitial, string>>;

/**
 * Ghana-first address form: label, service area, landmark directions and an
 * optional GhanaPost GPS digital address. Validates with the shared schema;
 * Firestore rules re-validate on save.
 */
export function AddressForm({
  areas,
  initial,
  submitLabel = "Save address",
  busy = false,
  serverError,
  onSubmit,
  onCancel,
}: {
  areas: ServiceArea[];
  initial?: AddressFormInitial;
  submitLabel?: string;
  busy?: boolean;
  serverError?: string | null;
  onSubmit(values: AddressValues, area: ServiceArea): void;
  onCancel?: () => void;
}) {
  const [label, setLabel] = useState(initial?.label ?? "Home");
  const [areaId, setAreaId] = useState(initial?.areaId ?? "");
  const [directions, setDirections] = useState(initial?.directions ?? "");
  const [ghanaPostGps, setGhanaPostGps] = useState(initial?.ghanaPostGps ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [errors, setErrors] = useState<FieldErrors>({});

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = addressInput.safeParse({ label, areaId, directions, ghanaPostGps, notes });
    const area = areas.find((a) => a.id === areaId);
    const next: FieldErrors = {};
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof AddressFormInitial;
        next[key] ??= key === "areaId" ? "Choose the area" : issue.message;
      }
    }
    if (!area) next.areaId = "Choose the area";
    setErrors(next);
    if (parsed.success && area) onSubmit(parsed.data, area);
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div>
        <TextField label="Address name" value={label} maxLength={40} onChange={(e) => setLabel(e.target.value)} error={errors.label} />
        <div className="mt-2 flex flex-wrap gap-2" aria-label="Suggested names">
          {ADDRESS_LABEL_SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setLabel(s)}
              className={`rounded-full border px-3 py-1 text-sm ${label === s ? "border-brand-500 bg-brand-50 text-brand-800" : "border-ink-200 text-ink-700 hover:border-ink-300"}`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
      <SelectField label="Area" value={areaId} onChange={(e) => setAreaId(e.target.value)} error={errors.areaId}>
        <option value="">Choose your area…</option>
        {areas.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
            {a.city !== a.name ? `, ${a.city}` : ""}
          </option>
        ))}
      </SelectField>
      <TextAreaField
        label="Directions"
        value={directions}
        maxLength={200}
        onChange={(e) => setDirections(e.target.value)}
        error={errors.directions}
        hint="Landmarks help technicians find you, e.g. “Behind A&C Mall, cream house with a black gate”."
      />
      <TextField
        label="GhanaPost GPS (optional)"
        value={ghanaPostGps}
        placeholder="GA-543-0125"
        autoCapitalize="characters"
        onChange={(e) => setGhanaPostGps(e.target.value)}
        error={errors.ghanaPostGps}
      />
      <TextAreaField
        label="Notes for the technician (optional)"
        value={notes}
        maxLength={300}
        rows={2}
        onChange={(e) => setNotes(e.target.value)}
        error={errors.notes}
      />
      {serverError && (
        <p role="alert" className="text-sm text-danger">
          {serverError}
        </p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="submit" busy={busy}>
          {submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
