import { WEEKDAY_NAMES, updateTechnicianServicesInput } from "@serviceflow/shared";
import { useState } from "react";
import { StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { PrimaryButton } from "../auth/forms";
import { Chip, ErrorText, Section, fieldStyles } from "../components/fields";
import { colors, fontSize, radius, space } from "../theme";
import type { Service } from "./TechnicianProvider";
import type { ServiceArea } from "./technician-store";

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

/** Accepts "8", "830", "8:30", "08.30" and returns "08:30", or the input unchanged if it can't. */
export function normalizeTime(input: string): string {
  const digits = input.replace(/\D/g, "");
  if (digits.length < 1 || digits.length > 4) return input.trim();
  const [h, m] = digits.length <= 2 ? [digits, "00"] : [digits.slice(0, digits.length - 2), digits.slice(-2)];
  return `${h.padStart(2, "0")}:${m}`;
}

/**
 * What a provider does, where and when — validated with the same shared
 * schema the `technicians-updateServices` callable uses. Areas are catalogue
 * ids; the server resolves their coordinates.
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
  const [serviceIds, setServiceIds] = useState(initial.serviceIds);
  const [areaIds, setAreaIds] = useState(initial.areaIds);
  const [days, setDays] = useState(() => toRows(initial.weeklyAvailability));
  const [error, setError] = useState<string | null>(null);

  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const setDay = (d: number, patch: Partial<DayRow>) => setDays((x) => ({ ...x, [d]: { ...x[d]!, ...patch } }));

  function submit() {
    const weeklyAvailability = DAY_ORDER.filter((d) => days[d]?.enabled).map((d) => ({
      day: d,
      start: normalizeTime(days[d]!.start),
      end: normalizeTime(days[d]!.end),
    }));
    const parsed = updateTechnicianServicesInput.safeParse({ requestId: "req_validateonly", serviceIds, areaIds, weeklyAvailability });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check your choices");
      return;
    }
    setError(null);
    onSubmit({ serviceIds, areaIds, weeklyAvailability });
  }

  return (
    <View style={{ gap: space[5] }}>
      <Section title="Services you offer">
        <View style={fieldStyles.wrap}>
          {services.map((s) => (
            <Chip key={s.id} label={s.name} selected={serviceIds.includes(s.id)} onPress={() => setServiceIds((l) => toggle(l, s.id))} />
          ))}
        </View>
      </Section>

      <Section title="Areas you cover" hint="You'll be matched with customers within about 8 km of each area (10 km for Tema and Kasoa).">
        <View style={fieldStyles.wrap}>
          {areas.map((a) => (
            <Chip key={a.id} label={a.name} selected={areaIds.includes(a.id)} onPress={() => setAreaIds((l) => toggle(l, a.id))} />
          ))}
        </View>
      </Section>

      <Section title="When you work" hint="24-hour times, e.g. 08:00 to 17:30.">
        <View style={styles.days}>
          {DAY_ORDER.map((d) => {
            const row = days[d]!;
            const name = WEEKDAY_NAMES[d];
            return (
              <View key={d} style={styles.day}>
                <Switch
                  accessibilityLabel={`Work on ${name}`}
                  value={row.enabled}
                  onValueChange={(enabled) => setDay(d, { enabled })}
                  trackColor={{ true: colors.brand, false: colors.border }}
                />
                <Text style={styles.dayName}>{name}</Text>
                {row.enabled ? (
                  <View style={styles.times}>
                    <TextInput
                      accessibilityLabel={`${name} start`}
                      style={styles.time}
                      value={row.start}
                      keyboardType="numbers-and-punctuation"
                      maxLength={5}
                      onChangeText={(start) => setDay(d, { start })}
                      onEndEditing={() => setDay(d, { start: normalizeTime(row.start) })}
                    />
                    <Text style={fieldStyles.muted}>to</Text>
                    <TextInput
                      accessibilityLabel={`${name} end`}
                      style={styles.time}
                      value={row.end}
                      keyboardType="numbers-and-punctuation"
                      maxLength={5}
                      onChangeText={(end) => setDay(d, { end })}
                      onEndEditing={() => setDay(d, { end: normalizeTime(row.end) })}
                    />
                  </View>
                ) : (
                  <Text style={fieldStyles.muted}>Not working</Text>
                )}
              </View>
            );
          })}
        </View>
      </Section>

      <ErrorText message={error ?? serverError} />
      <PrimaryButton label="Save" busy={busy} onPress={submit} />
    </View>
  );
}

const styles = StyleSheet.create({
  days: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface },
  day: { flexDirection: "row", alignItems: "center", gap: space[2], paddingHorizontal: space[3], paddingVertical: space[2], flexWrap: "wrap" },
  dayName: { width: 92, fontSize: fontSize.base, color: colors.text },
  times: { flexDirection: "row", alignItems: "center", gap: space[2] },
  time: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: space[2],
    paddingVertical: space[1],
    minWidth: 64,
    textAlign: "center",
    fontSize: fontSize.base,
    color: colors.text,
  },
});
