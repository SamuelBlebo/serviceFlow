import { ID_DOCUMENT_LABELS, IdDocumentType, normalizeIdNumber } from "@serviceflow/shared";
import { type FormEvent, useId, useState } from "react";
import { Button, SelectField, TextField } from "../../components/ui";

export interface VerificationValues {
  idType: IdDocumentType;
  idNumber: string;
  idPhoto: File;
  selfie: File;
}

/** Before compression; phones produce large photos. */
const MAX_ORIGINAL_BYTES = 20 * 1024 * 1024;

type Field = "idNumber" | "idPhoto" | "selfie";

function FileField({
  label,
  hint,
  capture,
  error,
  onChange,
}: {
  label: string;
  hint: string;
  capture: "user" | "environment";
  error?: string;
  onChange(file: File | null): void;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-ink-900">
        {label}
      </label>
      <input
        id={id}
        type="file"
        accept="image/*"
        capture={capture}
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        aria-invalid={error ? true : undefined}
        className="mt-1.5 block w-full text-sm text-ink-700 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-brand-800"
      />
      {error ? (
        <p className="mt-1.5 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : (
        <p className="mt-1.5 text-sm text-ink-500">{hint}</p>
      )}
    </div>
  );
}

/**
 * Identity documents: ID type + number + a photo of the ID + a selfie.
 * Photos are compressed and uploaded to a private folder only after this
 * form validates; the server checks them again.
 */
export function VerificationForm({ busy = false, serverError, onSubmit }: { busy?: boolean; serverError?: string | null; onSubmit(values: VerificationValues): void }) {
  const [idType, setIdType] = useState<IdDocumentType>(IdDocumentType.GHANA_CARD);
  const [idNumber, setIdNumber] = useState("");
  const [idPhoto, setIdPhoto] = useState<File | null>(null);
  const [selfie, setSelfie] = useState<File | null>(null);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});

  const checkPhoto = (file: File | null, what: string) =>
    !file ? `Add ${what}` : !file.type.startsWith("image/") ? `${what[0]?.toUpperCase()}${what.slice(1)} must be a photo` : file.size > MAX_ORIGINAL_BYTES ? "That photo is too large" : undefined;

  function submit(event: FormEvent) {
    event.preventDefault();
    const normalized = normalizeIdNumber(idType, idNumber);
    const next: Partial<Record<Field, string>> = {
      idNumber: normalized ? undefined : idType === IdDocumentType.GHANA_CARD ? "Enter your Ghana Card number like GHA-123456789-0" : "Check the ID number",
      idPhoto: checkPhoto(idPhoto, "a photo of your ID"),
      selfie: checkPhoto(selfie, "a selfie"),
    };
    setErrors(next);
    if (normalized && idPhoto && selfie && !next.idPhoto && !next.selfie) onSubmit({ idType, idNumber: normalized, idPhoto, selfie });
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <SelectField label="ID type" value={idType} onChange={(e) => setIdType(e.target.value as IdDocumentType)}>
        {Object.values(IdDocumentType).map((t) => (
          <option key={t} value={t}>
            {ID_DOCUMENT_LABELS[t]}
          </option>
        ))}
      </SelectField>
      <TextField
        label="ID number"
        value={idNumber}
        autoCapitalize="characters"
        placeholder={idType === IdDocumentType.GHANA_CARD ? "GHA-123456789-0" : undefined}
        onChange={(e) => setIdNumber(e.target.value)}
        error={errors.idNumber}
      />
      <FileField
        label="Photo of your ID"
        hint="Front of the card, all four corners visible, no glare."
        capture="environment"
        error={errors.idPhoto}
        onChange={setIdPhoto}
      />
      <FileField label="Selfie" hint="Your face, clearly lit, no sunglasses or hat." capture="user" error={errors.selfie} onChange={setSelfie} />
      <p className="text-sm text-ink-500">Your documents are private: only you and ServiceFlow's verification team can see them.</p>
      {serverError && (
        <p role="alert" className="text-sm text-danger">
          {serverError}
        </p>
      )}
      <Button type="submit" busy={busy}>
        Submit for review
      </Button>
    </form>
  );
}
