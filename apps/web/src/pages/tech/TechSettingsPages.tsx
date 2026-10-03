import { TECHNICIAN_LIMITS } from "@serviceflow/shared";
import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router";
import { Button, Card, TextAreaField, TextField } from "../../components/ui";
import { type WorkSettings, WorkSettingsForm } from "../../features/technician/WorkSettingsForm";
import { messageFromError } from "../../lib/errors";
import { newRequestId } from "../../lib/request-id";
import { useReadyTechnician } from "../../lib/technician/TechnicianProvider";

/** Services, coverage areas and weekly hours (through the validated callable). */
export function TechAvailabilityPage() {
  const ready = useReadyTechnician();
  const navigate = useNavigate();
  const [requestId, setRequestId] = useState(newRequestId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  if (!ready) return null;
  const { technician, services, areas, store } = ready;

  async function save(settings: WorkSettings) {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await store.updateServices({ requestId, ...settings });
      setRequestId(newRequestId());
      setSaved(true);
      if (technician.verificationStatus === "UNSUBMITTED") navigate("/tech/verification");
    } catch (err) {
      setError(messageFromError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Services &amp; availability</h1>
      <Card title="What you do, where and when">
        <WorkSettingsForm
          services={services}
          areas={areas}
          initial={{
            serviceIds: technician.serviceIds,
            areaIds: technician.serviceAreas.map((a) => a.areaId).filter((id): id is string => Boolean(id)),
            weeklyAvailability: technician.weeklyAvailability,
          }}
          busy={busy}
          serverError={error}
          onSubmit={(s) => void save(s)}
        />
        {saved && (
          <p role="status" className="mt-3 text-sm text-brand-700">
            Saved
          </p>
        )}
      </Card>
    </div>
  );
}

/** Public profile details the technician edits directly (rules-validated). */
export function TechProfilePage() {
  const ready = useReadyTechnician();
  if (!ready) return null;
  return <ProfileForm key={ready.technician.id} />;
}

function ProfileForm() {
  const ready = useReadyTechnician()!;
  const { uid, technician, store } = ready;
  const [bio, setBio] = useState(technician.bio);
  const [years, setYears] = useState(String(technician.yearsExperience));
  const [photo, setPhoto] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!/^\d{1,2}$/.test(years.trim())) {
      setError("Enter a number of years, e.g. 5");
      return;
    }
    if (photo && !photo.type.startsWith("image/")) {
      setError("Your profile picture must be a photo");
      return;
    }
    setError(null);
    setStatus("saving");
    try {
      await store.updateProfile(uid, { bio: bio.trim(), yearsExperience: Number(years), photo });
      setPhoto(null);
      setStatus("saved");
    } catch (err) {
      setError(messageFromError(err));
      setStatus("idle");
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Provider profile</h1>
      <Card title="What customers see">
        <form onSubmit={save} noValidate className="space-y-4">
          <p className="text-ink-700">
            <span className="text-sm text-ink-500">Name</span>
            <br />
            {technician.displayName}
          </p>
          <TextAreaField label="About you" value={bio} maxLength={TECHNICIAN_LIMITS.bioMax} onChange={(e) => setBio(e.target.value)} hint="Your experience, specialities and the kind of jobs you enjoy." />
          <TextField label="Years of experience" inputMode="numeric" value={years} onChange={(e) => setYears(e.target.value)} />
          <div>
            <label htmlFor="profile-photo" className="block text-sm font-medium text-ink-900">
              Profile photo
            </label>
            <input id="profile-photo" type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} className="mt-1.5 block text-sm" />
            {technician.photoPath && <p className="mt-1 text-sm text-ink-500">You have a profile photo. Choose a new one to replace it.</p>}
          </div>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <div className="flex items-center gap-3">
            <Button type="submit" busy={status === "saving"}>
              Save profile
            </Button>
            {status === "saved" && (
              <span role="status" className="text-sm text-brand-700">
                Saved
              </span>
            )}
          </div>
        </form>
      </Card>
    </div>
  );
}
