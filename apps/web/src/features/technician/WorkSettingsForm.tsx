import { WEEKDAY_NAMES, updateTechnicianServicesInput } from "@serviceflow/shared";
import { type FormEvent, useState } from "react";
import { Button } from "../../components/ui";
import type { Service } from "../../lib/admin/catalogue-store";
import type { ServiceArea } from "../../lib/profile/customer-store";

export interface WorkSettings {
  serviceIds: string[];
  areaIds: string[];
  weeklyAvailability: Array<{ day: number; start: string; end: string }>;
}

interface DayRow {
  enabled: boolean;
  start: string;
  end: string;
}

// Monday first: how working weeks are usually read.
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

function toRows(windows: WorkSettings["weeklyAvailability"]): Record<number, DayRow> {
  const rows: Record<number, DayRow> = {};
  for (const day of DAY_ORDER) {
    const w = windows.find((x) => x.day === day);
    rows[day] = w ? { enabled: true, start: w.start, end: w.end } : { enabled: false, start: "08:00", end: "17:00" };
  }
  return rows;
}

/**
 * What a technician does, where and when. Validated with the same shared
 * schema the `technicians-updateServices` callable uses; areas are catalogue
 * ids (the server resolves their coordinates).
 */
export function WorkSettingsForm({
  services,
  areas,
  initial,
  busy = false,
  serverError,
  onSubmit,
}: {
  services: Service[];
  areas: ServiceArea[];
  initial: WorkSettings;
  busy?: boolean;
  serverError?: string | null;
  onSubmit(settings: WorkSettings): void;
}) {
  const [serviceIds, setServiceIds] = useState<string[]>(initial.serviceIds);
  const [areaIds, setAreaIds] = useState<string[]>(initial.areaIds);
  const [days, setDays] = useState(() => toRows(initial.weeklyAvailability));
  const [error, setError] = useState<string | null>(null);

  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const weeklyAvailability = DAY_ORDER.filter((d) => days[d]?.enabled).map((d) => ({ day: d, start: days[d]!.start, end: days[d]!.end }));
    const parsed = updateTechnicianServicesInput.safeParse({ requestId: "req_validateonly", serviceIds, areaIds, weeklyAvailability });
    if (!parsed.success) {
      // The shared schema's messages are written for people ("Choose at least one service", …).
      setError(parsed.error.issues[0]?.message ?? "Check your choices");
      return;
    }
    setError(null);
    onSubmit({ serviceIds, areaIds, weeklyAvailability });
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      <fieldset>
        <legend className="text-sm font-medium text-ink-900">Services you offer</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {services.map((s) => (
            <label key={s.id} className="flex items-center gap-2 rounded-lg border border-ink-100 px-3 py-2">
              <input type="checkbox" checked={serviceIds.includes(s.id)} onChange={() => setServiceIds((l) => toggle(l, s.id))} />
              <span className="text-ink-800">{s.name}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-medium text-ink-900">Areas you cover</legend>
        <p className="mt-1 text-sm text-ink-500">You'll be matched with customers within about 8 km of each area (10 km for Tema and Kasoa).</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {areas.map((a) => (
            <label key={a.id} className="flex items-center gap-2 rounded-lg border border-ink-100 px-3 py-2">
              <input type="checkbox" checked={areaIds.includes(a.id)} onChange={() => setAreaIds((l) => toggle(l, a.id))} />
              <span className="text-ink-800">{a.name}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-medium text-ink-900">When you work</legend>
        <div className="mt-2 divide-y divide-ink-100 rounded-lg border border-ink-100">
          {DAY_ORDER.map((d) => {
            const row = days[d]!;
            const name = WEEKDAY_NAMES[d];
            return (
              <div key={d} className="flex flex-wrap items-center gap-3 px-3 py-2">
                <label className="flex w-32 items-center gap-2">
                  <input type="checkbox" checked={row.enabled} onChange={() => setDays((x) => ({ ...x, [d]: { ...row, enabled: !row.enabled } }))} />
                  <span className="text-ink-800">{name}</span>
                </label>
                {row.enabled ? (
                  <span className="flex items-center gap-2 text-sm">
                    <input
                      type="time"
                      aria-label={`${name} start`}
                      value={row.start}
                      onChange={(e) => setDays((x) => ({ ...x, [d]: { ...row, start: e.target.value } }))}
                      className="rounded border border-ink-200 px-2 py-1"
                    />
                    to
                    <input
                      type="time"
                      aria-label={`${name} end`}
                      value={row.end}
                      onChange={(e) => setDays((x) => ({ ...x, [d]: { ...row, end: e.target.value } }))}
                      className="rounded border border-ink-200 px-2 py-1"
                    />
                  </span>
                ) : (
                  <span className="text-sm text-ink-500">Not working</span>
                )}
              </div>
            );
          })}
        </div>
      </fieldset>

      {(error ?? serverError) && (
        <p role="alert" className="text-sm text-danger">
          {error ?? serverError}
        </p>
      )}
      <Button type="submit" busy={busy}>
        Save
      </Button>
    </form>
  );
}
