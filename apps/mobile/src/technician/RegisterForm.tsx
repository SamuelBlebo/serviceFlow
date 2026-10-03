import { registerTechnicianInput } from "@serviceflow/shared";
import { useState } from "react";
import { View } from "react-native";
import { PrimaryButton } from "../auth/forms";
import { ErrorText, Field } from "../components/fields";
import { space } from "../theme";

export interface RegisterValues {
  displayName: string;
  yearsExperience: number;
}

/** Become a provider: public name and experience, checked with the callable's own schema. */
export function RegisterForm({
  initialName = "",
  busy = false,
  serverError,
  onSubmit,
}: {
  initialName?: string;
  busy?: boolean;
  serverError?: string | null;
  onSubmit(values: RegisterValues): void;
}) {
  const [displayName, setDisplayName] = useState(initialName);
  const [years, setYears] = useState("");
  const [errors, setErrors] = useState<{ displayName?: string; years?: string }>({});

  function submit() {
    const yearsExperience = years.trim() === "" ? Number.NaN : Number(years);
    const parsed = registerTechnicianInput.safeParse({ requestId: "req_validateonly", displayName, yearsExperience });
    if (!parsed.success) {
      const next: typeof errors = {};
      for (const issue of parsed.error.issues) {
        if (issue.path[0] === "displayName") next.displayName = "Enter your name using letters only (2-80 characters)";
        if (issue.path[0] === "yearsExperience") next.years = "Enter your years of experience (0-60)";
      }
      setErrors(next);
      return;
    }
    setErrors({});
    onSubmit({ displayName: parsed.data.displayName, yearsExperience: parsed.data.yearsExperience });
  }

  return (
    <View style={{ gap: space[3] }}>
      <Field label="Name customers will see" value={displayName} onChangeText={setDisplayName} autoComplete="name" error={errors.displayName} editable={!busy} />
      <Field label="Years of experience" value={years} onChangeText={(t) => setYears(t.replace(/\D/g, "").slice(0, 2))} keyboardType="number-pad" error={errors.years} editable={!busy} />
      <ErrorText message={serverError} />
      <PrimaryButton label="Register as a provider" busy={busy} onPress={submit} />
    </View>
  );
}
