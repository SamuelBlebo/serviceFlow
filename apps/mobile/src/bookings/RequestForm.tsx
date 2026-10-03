import { PreferredTime, createBookingInput, formatMoneyRange } from "@serviceflow/shared";
import { useState } from "react";
import { Text, View } from "react-native";
import { PrimaryButton } from "../auth/forms";
import { Chip, ErrorText, Field, Section, fieldStyles } from "../components/fields";
import type { Service } from "../technician/TechnicianProvider";
import { space } from "../theme";
import type { Address } from "./booking-store";

export interface RequestValues {
  serviceId: string;
  problemDescription: string;
  addressId: string;
  preferredTime: PreferredTime;
}

// Scheduling a specific date and time is on the web for now (no date picker on mobile yet).
const TIMES: Array<{ value: PreferredTime; label: string }> = [
  { value: PreferredTime.ASAP, label: "As soon as possible" },
  { value: PreferredTime.TODAY, label: "Later today" },
  { value: PreferredTime.TOMORROW, label: "Tomorrow" },
];

type FieldName = "serviceId" | "problemDescription" | "addressId";

/** Request a service: what, where (a saved address) and when — checked with the server's schema. */
export function RequestForm({
  services,
  addresses,
  defaultAddressId,
  busy = false,
  serverError,
  onSubmit,
}: {
  services: Service[];
  addresses: Address[];
  defaultAddressId: string | null;
  busy?: boolean;
  serverError?: string | null;
  onSubmit(values: RequestValues): void;
}) {
  const [serviceId, setServiceId] = useState("");
  const [problem, setProblem] = useState("");
  const [addressId, setAddressId] = useState(defaultAddressId ?? addresses[0]?.id ?? "");
  const [preferredTime, setPreferredTime] = useState<PreferredTime>(PreferredTime.ASAP);
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const service = services.find((s) => s.id === serviceId);

  if (addresses.length === 0) {
    return (
      <View style={fieldStyles.card}>
        <Text style={fieldStyles.body}>Add an address first, so the technician knows where to come.</Text>
        <Text style={fieldStyles.muted}>Add one in your profile on the ServiceFlow website for now; address editing is coming to the app.</Text>
      </View>
    );
  }

  function submit() {
    const values = { serviceId, problemDescription: problem.trim(), addressId, preferredTime };
    const next: Partial<Record<FieldName, string>> = {};
    const parsed = createBookingInput.safeParse({ requestId: "req_validateonly", ...values });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const f = issue.path[0] as FieldName;
        if (f && !next[f]) next[f] = issue.message;
      }
    }
    if (!serviceId) next.serviceId = "Choose a service";
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;
    onSubmit(values);
  }

  return (
    <View style={{ gap: space[5] }}>
      <Section title="Service" hint={service ? `Typical price ${formatMoneyRange(service.priceRange.minMinor, service.priceRange.maxMinor)}` : undefined}>
        <View style={fieldStyles.wrap}>
          {services.map((s) => (
            <Chip key={s.id} label={s.name} selected={serviceId === s.id} onPress={() => setServiceId(s.id)} />
          ))}
        </View>
        <ErrorText message={errors.serviceId} />
      </Section>
      <Field
        label="What's the problem?"
        value={problem}
        onChangeText={setProblem}
        multiline
        maxLength={1000}
        placeholder="e.g. The kitchen sink pipe is leaking"
        error={errors.problemDescription}
      />
      <Section title="Where" hint="Your phone number and directions go only to the technician who accepts.">
        <View style={fieldStyles.wrap}>
          {addresses.map((a) => (
            <Chip key={a.id} label={`${a.label} · ${a.areaName}`} selected={addressId === a.id} onPress={() => setAddressId(a.id)} />
          ))}
        </View>
        <ErrorText message={errors.addressId} />
      </Section>
      <Section title="When">
        <View style={fieldStyles.wrap}>
          {TIMES.map((t) => (
            <Chip key={t.value} label={t.label} selected={preferredTime === t.value} onPress={() => setPreferredTime(t.value)} />
          ))}
        </View>
      </Section>
      <ErrorText message={serverError} />
      <PrimaryButton label="Request a technician" busy={busy} onPress={submit} />
      <Text style={fieldStyles.muted}>The technician confirms the final price with you before starting any work.</Text>
    </View>
  );
}
