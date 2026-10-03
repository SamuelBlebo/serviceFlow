import { SERVICE_LIMITS, slugify, toMinor, upsertServiceInput } from "@serviceflow/shared";
import { type FormEvent, useState } from "react";
import { Button, TextAreaField, TextField } from "../../components/ui";

export interface ServiceFormValues {
  name: string;
  description: string;
  priceRange: { minMinor: number; maxMinor: number };
  sortOrder: number;
}

type Field = "name" | "description" | "minPrice" | "maxPrice" | "sortOrder";

const CEDIS = /^\d{1,6}(\.\d{1,2})?$/;

/**
 * Create/edit a catalogue service. Admins type prices in cedis; the form
 * converts to pesewas and validates with the same shared schema the
 * `admin-upsertService` callable uses.
 */
export function ServiceForm({
  initial,
  editing,
  busy = false,
  serverError,
  onSubmit,
  onCancel,
}: {
  initial?: ServiceFormValues;
  /** Set when editing: the fixed web address (slug). */
  editing?: string;
  busy?: boolean;
  serverError?: string | null;
  onSubmit(values: ServiceFormValues): void;
  onCancel(): void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [minPrice, setMinPrice] = useState(initial ? (initial.priceRange.minMinor / 100).toFixed(2) : "");
  const [maxPrice, setMaxPrice] = useState(initial ? (initial.priceRange.maxMinor / 100).toFixed(2) : "");
  const [sortOrder, setSortOrder] = useState(String(initial?.sortOrder ?? 10));
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});

  const slugPreview = editing ?? slugify(name);

  function submit(event: FormEvent) {
    event.preventDefault();
    const next: Partial<Record<Field, string>> = {};
    if (!CEDIS.test(minPrice.trim())) next.minPrice = "Enter an amount in cedis, e.g. 150 or 150.50";
    if (!CEDIS.test(maxPrice.trim())) next.maxPrice = "Enter an amount in cedis, e.g. 600";
    if (!/^\d{1,3}$/.test(sortOrder.trim())) next.sortOrder = "Use a whole number from 0 to 999";

    if (Object.keys(next).length === 0) {
      const values = {
        name,
        description,
        priceRange: { minMinor: toMinor(Number(minPrice)), maxMinor: toMinor(Number(maxPrice)) },
        sortOrder: Number(sortOrder),
      };
      const parsed = upsertServiceInput.safeParse({ ...values, requestId: "req_validateonly", serviceId: editing });
      if (parsed.success) {
        setErrors({});
        onSubmit({ ...values, name: parsed.data.name, description: parsed.data.description });
        return;
      }
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (key === "priceRange") next.maxPrice ??= issue.message;
        else if (key === "name" || key === "description" || key === "sortOrder") next[key] ??= issue.message;
      }
    }
    setErrors(next);
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <TextField
        label="Service name"
        value={name}
        maxLength={SERVICE_LIMITS.nameMax}
        onChange={(e) => setName(e.target.value)}
        error={errors.name}
        hint={slugPreview ? <>Web address: /services/{slugPreview}{editing ? " (fixed)" : ""}</> : undefined}
      />
      <TextAreaField
        label="Description"
        value={description}
        maxLength={SERVICE_LIMITS.descriptionMax}
        onChange={(e) => setDescription(e.target.value)}
        error={errors.description}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Lowest typical price (GH₵)" inputMode="decimal" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} error={errors.minPrice} />
        <TextField label="Highest typical price (GH₵)" inputMode="decimal" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} error={errors.maxPrice} />
      </div>
      <TextField
        label="Display order"
        inputMode="numeric"
        value={sortOrder}
        onChange={(e) => setSortOrder(e.target.value)}
        error={errors.sortOrder}
        hint="Lower numbers appear first."
      />
      {serverError && (
        <p role="alert" className="text-sm text-danger">
          {serverError}
        </p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="submit" busy={busy}>
          {editing ? "Save changes" : "Create service"}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
