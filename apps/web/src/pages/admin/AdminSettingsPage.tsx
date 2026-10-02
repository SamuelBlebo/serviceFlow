import {
  CommissionScope,
  type PlatformSettingsDoc,
  SETTINGS_LIMITS,
  createCommissionRuleInput,
  formatGhanaPhoneForDisplay,
  updatePlatformSettingsInput,
  upsertServiceAreaInput,
} from "@serviceflow/shared";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { Link } from "react-router";
import { Button, Card, SelectField, TextField } from "../../components/ui";
import { isReauthRequired } from "../../features/technician/ReviewActions";
import { type Service, watchAllServices } from "../../lib/admin/catalogue-store";
import {
  type AdminStore,
  type Area,
  type CommissionRule,
  adminStore,
  watchAllAreas,
  watchCommissionRules,
  watchPlatformSettings,
} from "../../lib/admin/admin-store";
import { FullPageSpinner } from "../../lib/auth/guards";
import { messageFromError } from "../../lib/errors";
import { newRequestId } from "../../lib/request-id";

export interface AdminSettingsDeps {
  store?: AdminStore;
  watchSettings?: typeof watchPlatformSettings;
  watchRules?: typeof watchCommissionRules;
  watchAreas?: typeof watchAllAreas;
  watchServices?: typeof watchAllServices;
}

type Feedback = { kind: "error"; message: string; reauth: boolean } | { kind: "ok"; message: string } | null;

/** One submission at a time; the request id is reused on retry so nothing applies twice. */
function useSubmit() {
  const [requestId, setRequestId] = useState(newRequestId);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  async function run(fn: (requestId: string) => Promise<unknown>, ok: string) {
    setBusy(true);
    setFeedback(null);
    try {
      await fn(requestId);
      setRequestId(newRequestId());
      setFeedback({ kind: "ok", message: ok });
      return true;
    } catch (e) {
      setFeedback({ kind: "error", message: messageFromError(e), reauth: isReauthRequired(e) });
      return false;
    } finally {
      setBusy(false);
    }
  }
  const fail = (message: string) => setFeedback({ kind: "error", message, reauth: false });
  return { busy, feedback, run, fail };
}

function FeedbackLine({ feedback }: { feedback: Feedback }): ReactNode {
  if (!feedback) return null;
  if (feedback.kind === "ok") return <p className="text-sm text-brand-700">{feedback.message}</p>;
  if (feedback.reauth)
    return (
      <p role="alert" className="text-sm text-danger">
        Settings that affect money need a fresh sign-in.{" "}
        <Link to="/admin/login?reason=reauth" className="font-medium underline">
          Sign in again
        </Link>
      </p>
    );
  return (
    <p role="alert" className="text-sm text-danger">
      {feedback.message}
    </p>
  );
}

const firstIssue = (r: { success: boolean; error?: { issues: Array<{ message: string }> } }) => r.error?.issues[0]?.message ?? "Check the values";

function PlatformSettingsForm({ settings, store }: { settings: PlatformSettingsDoc; store: Pick<AdminStore, "updateSettings"> }) {
  const [values, setValues] = useState({
    commission: String(settings.defaultCommissionPercent),
    offer: String(settings.offerTimeoutMinutes),
    matching: String(settings.matchingExpiryMinutes),
    radius: String(settings.matchRadiusKm),
    phone: settings.supportPhone ? formatGhanaPhoneForDisplay(settings.supportPhone) : "",
  });
  const submit = useSubmit();
  const set = (k: keyof typeof values) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [k]: e.target.value }));

  function save(event: FormEvent) {
    event.preventDefault();
    const input = {
      defaultCommissionPercent: Number(values.commission),
      offerTimeoutMinutes: Number(values.offer),
      matchingExpiryMinutes: Number(values.matching),
      matchRadiusKm: Number(values.radius),
      supportPhone: values.phone.trim() || undefined,
    };
    const parsed = updatePlatformSettingsInput.safeParse({ requestId: "req_validateonly", ...input });
    if (!parsed.success) return submit.fail(firstIssue(parsed));
    void submit.run((requestId) => store.updateSettings({ requestId, ...input }), "Settings saved.");
  }

  return (
    <Card title="Platform">
      <form onSubmit={save} noValidate className="grid gap-4 sm:grid-cols-2">
        <TextField label="Default commission (%)" inputMode="decimal" value={values.commission} onChange={set("commission")} hint="Used when no commission rule applies." />
        <TextField label="Offer time (minutes)" inputMode="numeric" value={values.offer} onChange={set("offer")} hint={`How long a technician has to accept (${SETTINGS_LIMITS.offerTimeoutMinutes.min}–${SETTINGS_LIMITS.offerTimeoutMinutes.max}).`} />
        <TextField label="Matching time (minutes)" inputMode="numeric" value={values.matching} onChange={set("matching")} hint="Unmatched bookings are cancelled after this." />
        <TextField label="Search radius (km)" inputMode="decimal" value={values.radius} onChange={set("radius")} hint="Distance at which a technician scores zero." />
        <TextField label="Support phone" inputMode="tel" value={values.phone} onChange={set("phone")} />
        <div className="space-y-2 sm:col-span-2">
          <FeedbackLine feedback={submit.feedback} />
          <Button type="submit" busy={submit.busy}>
            Save settings
          </Button>
        </div>
      </form>
    </Card>
  );
}

function CommissionRules({
  rules,
  services,
  defaultPercent,
  store,
}: {
  rules: CommissionRule[];
  services: Service[];
  defaultPercent: number;
  store: Pick<AdminStore, "createCommissionRule" | "setCommissionRuleActive">;
}) {
  const [scope, setScope] = useState<CommissionScope>(CommissionScope.SERVICE);
  const [target, setTarget] = useState("");
  const [percent, setPercent] = useState("");
  const create = useSubmit();
  const toggle = useSubmit();
  const label = (r: CommissionRule) =>
    r.scope === "GLOBAL" ? "Everyone" : r.scope === "SERVICE" ? `Service: ${services.find((s) => s.id === r.serviceId)?.name ?? r.serviceId}` : `Technician: ${r.technicianId}`;

  function add(event: FormEvent) {
    event.preventDefault();
    const input = {
      scope,
      serviceId: scope === "SERVICE" ? target || undefined : undefined,
      technicianId: scope === "TECHNICIAN" ? target.trim() || undefined : undefined,
      percent: Number(percent),
    };
    const parsed = createCommissionRuleInput.safeParse({ requestId: "req_validateonly", ...input });
    if (!parsed.success) return create.fail(firstIssue(parsed));
    void create.run((requestId) => store.createCommissionRule({ requestId, ...input }), "Rule added.").then((ok) => ok && setPercent(""));
  }

  return (
    <Card title="Commission rules">
      <p className="text-sm text-ink-600">
        The most specific active rule wins: technician, then service, then everyone. With none, the default ({defaultPercent}%) applies. The percentage is locked
        on each booking when the customer confirms.
      </p>
      <ul className="mt-4 divide-y divide-ink-100 rounded-lg border border-ink-100">
        {rules.length === 0 && <li className="px-3 py-2 text-ink-500">No rules yet.</li>}
        {rules.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2" data-testid={`rule-${r.id}`}>
            <span className={r.isActive ? "text-ink-900" : "text-ink-400 line-through"}>
              {label(r)} — {r.percent}%
            </span>
            <Button
              variant="ghost"
              busy={toggle.busy}
              onClick={() => void toggle.run((requestId) => store.setCommissionRuleActive({ requestId, ruleId: r.id, isActive: !r.isActive }), r.isActive ? "Rule switched off." : "Rule switched on.")}
            >
              {r.isActive ? "Switch off" : "Switch on"}
            </Button>
          </li>
        ))}
      </ul>
      <FeedbackLine feedback={toggle.feedback} />
      <form onSubmit={add} noValidate className="mt-4 grid gap-3 sm:grid-cols-4">
        <SelectField label="Applies to" value={scope} onChange={(e) => (setScope(e.target.value as CommissionScope), setTarget(""))}>
          <option value="SERVICE">A service</option>
          <option value="TECHNICIAN">A technician</option>
          <option value="GLOBAL">Everyone</option>
        </SelectField>
        {scope === "SERVICE" && (
          <SelectField label="Service" value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">Choose…</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </SelectField>
        )}
        {scope === "TECHNICIAN" && <TextField label="Technician id" value={target} onChange={(e) => setTarget(e.target.value)} />}
        <TextField label="Commission (%)" inputMode="decimal" value={percent} onChange={(e) => setPercent(e.target.value)} />
        <div className="flex items-end">
          <Button type="submit" busy={create.busy}>
            Add rule
          </Button>
        </div>
        <div className="sm:col-span-4">
          <FeedbackLine feedback={create.feedback} />
        </div>
      </form>
    </Card>
  );
}

const emptyArea = { name: "", city: "Accra", region: "Greater Accra", lat: "", lng: "", radius: "8" };

function ServiceAreas({ areas, store }: { areas: Area[]; store: Pick<AdminStore, "upsertArea" | "setAreaActive"> }) {
  const [editing, setEditing] = useState<string | null>(null); // area id, "new" or null
  const [values, setValues] = useState(emptyArea);
  const save = useSubmit();
  const toggle = useSubmit();
  const set = (k: keyof typeof values) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [k]: e.target.value }));

  function edit(a: Area | null) {
    setEditing(a ? a.id : "new");
    setValues(a ? { name: a.name, city: a.city, region: a.region, lat: String(a.center.lat), lng: String(a.center.lng), radius: String(a.defaultRadiusKm) } : emptyArea);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const input = {
      areaId: editing && editing !== "new" ? editing : undefined,
      name: values.name.trim(),
      city: values.city.trim(),
      region: values.region.trim(),
      center: { lat: Number(values.lat), lng: Number(values.lng) },
      defaultRadiusKm: Number(values.radius),
    };
    const parsed = upsertServiceAreaInput.safeParse({ requestId: "req_validateonly", ...input });
    if (!parsed.success) return save.fail(firstIssue(parsed));
    void save.run((requestId) => store.upsertArea({ requestId, ...input }), "Area saved.").then((ok) => ok && setEditing(null));
  }

  return (
    <Card title="Service areas" action={<Button variant="secondary" onClick={() => edit(null)}>Add area</Button>}>
      <p className="text-sm text-ink-600">Customers choose from active areas when saving an address; hidden areas stay on existing addresses.</p>
      {editing && (
        <form onSubmit={submit} noValidate className="mt-4 grid gap-3 rounded-lg border border-ink-100 p-4 sm:grid-cols-3" aria-label="Area details">
          <TextField label="Area name" value={values.name} onChange={set("name")} />
          <TextField label="City" value={values.city} onChange={set("city")} />
          <TextField label="Region" value={values.region} onChange={set("region")} />
          <TextField label="Centre latitude" inputMode="decimal" value={values.lat} onChange={set("lat")} />
          <TextField label="Centre longitude" inputMode="decimal" value={values.lng} onChange={set("lng")} />
          <TextField label="Radius (km)" inputMode="decimal" value={values.radius} onChange={set("radius")} />
          <div className="flex gap-2 sm:col-span-3">
            <Button type="submit" busy={save.busy}>
              Save area
            </Button>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
      <FeedbackLine feedback={save.feedback ?? toggle.feedback} />
      <ul className="mt-4 divide-y divide-ink-100 rounded-lg border border-ink-100">
        {areas.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2" data-testid={`area-${a.id}`}>
            <span className={a.isActive ? "text-ink-900" : "text-ink-400"}>
              {a.name} · {a.city} · {a.defaultRadiusKm} km{a.isActive ? "" : " · hidden"}
            </span>
            <span className="flex gap-1">
              <Button variant="ghost" onClick={() => edit(a)}>
                Edit
              </Button>
              <Button
                variant="ghost"
                busy={toggle.busy}
                onClick={() => void toggle.run((requestId) => store.setAreaActive({ requestId, areaId: a.id, isActive: !a.isActive }), a.isActive ? "Area hidden." : "Area shown.")}
              >
                {a.isActive ? "Hide" : "Show"}
              </Button>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** `/admin/settings` — platform settings, commission rules and service areas (all audited). */
export function AdminSettingsPage({
  store = adminStore,
  watchSettings = watchPlatformSettings,
  watchRules = watchCommissionRules,
  watchAreas = watchAllAreas,
  watchServices = watchAllServices,
}: AdminSettingsDeps = {}) {
  const [settings, setSettings] = useState<PlatformSettingsDoc | null | undefined>(undefined);
  const [rules, setRules] = useState<CommissionRule[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fail = () => setError("We couldn't load the settings. Check your connection.");
    const unsubs = [watchSettings(setSettings, fail), watchRules(setRules, fail), watchAreas(setAreas, fail), watchServices(setServices, fail)];
    return () => unsubs.forEach((u) => u());
  }, [watchSettings, watchRules, watchAreas, watchServices]);

  if (error) return <p role="alert" className="px-4 py-10">{error}</p>;
  if (settings === undefined) return <FullPageSpinner />;

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Settings</h1>
      {settings ? (
        <PlatformSettingsForm settings={settings} store={store} />
      ) : (
        <p role="alert">Platform settings are missing. Run the seed script for this environment.</p>
      )}
      <CommissionRules rules={rules} services={services} defaultPercent={settings?.defaultCommissionPercent ?? 15} store={store} />
      <ServiceAreas areas={areas} store={store} />
    </div>
  );
}
