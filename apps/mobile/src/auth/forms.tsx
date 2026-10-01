import { isValidGhanaPhone } from "@serviceflow/shared";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { colors, fontSize, radius, space } from "../theme";

/**
 * Presentational sign-in forms. Validation is local and instant (no mobile
 * data spent on obviously wrong input); the server re-validates everything.
 * Large touch targets and clear errors for low-end Android phones.
 */

export function PhoneForm({
  busy,
  serverError,
  onSubmit,
}: {
  busy: boolean;
  serverError?: string | null;
  onSubmit(phone: string): void;
}) {
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    if (!isValidGhanaPhone(phone)) {
      setError("Enter a valid Ghanaian phone number, e.g. 024 123 4567");
      return;
    }
    setError(null);
    onSubmit(phone);
  }

  return (
    <View style={styles.form}>
      <Text style={styles.label}>Phone number</Text>
      <TextInput
        accessibilityLabel="Phone number"
        style={styles.input}
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
        placeholder="024 123 4567"
        placeholderTextColor={colors.textSubtle}
        value={phone}
        onChangeText={setPhone}
        onSubmitEditing={submit}
        editable={!busy}
      />
      <FormError message={error ?? serverError} />
      <PrimaryButton label="Send code" busy={busy} onPress={submit} />
    </View>
  );
}

export function CodeForm({
  busy,
  serverError,
  onSubmit,
}: {
  busy: boolean;
  serverError?: string | null;
  onSubmit(code: string): void;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    if (!/^\d{6}$/.test(code)) {
      setError("Enter the 6-digit code we sent you");
      return;
    }
    setError(null);
    onSubmit(code);
  }

  return (
    <View style={styles.form}>
      <Text style={styles.label}>6-digit code</Text>
      <TextInput
        accessibilityLabel="6-digit code"
        style={[styles.input, styles.code]}
        keyboardType="number-pad"
        autoComplete="sms-otp"
        textContentType="oneTimeCode"
        maxLength={6}
        value={code}
        onChangeText={(t) => setCode(t.replace(/\D/g, "").slice(0, 6))}
        onSubmitEditing={submit}
        editable={!busy}
      />
      <FormError message={error ?? serverError} />
      <PrimaryButton label="Verify and sign in" busy={busy} onPress={submit} />
    </View>
  );
}

function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <Text style={styles.error} accessible accessibilityRole="alert">
      {message}
    </Text>
  );
}

export function PrimaryButton({ label, busy, onPress }: { label: string; busy?: boolean; onPress(): void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy: Boolean(busy), disabled: Boolean(busy) }}
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => [styles.button, (pressed || busy) && styles.buttonPressed]}
    >
      {busy ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.buttonText}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  form: { gap: space[3] },
  label: { fontSize: fontSize.sm, fontWeight: "600", color: colors.text },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    fontSize: fontSize.lg,
    color: colors.text,
  },
  code: { letterSpacing: 8, textAlign: "center" },
  error: { color: colors.danger, fontSize: fontSize.sm },
  button: {
    backgroundColor: colors.brand,
    borderRadius: radius.md,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    marginTop: space[2],
  },
  buttonPressed: { backgroundColor: colors.brandDark },
  buttonText: { color: colors.surface, fontSize: fontSize.base, fontWeight: "600" },
});
