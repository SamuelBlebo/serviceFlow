import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, TextInput, type TextInputProps, View } from "react-native";
import { colors, fontSize, radius, space } from "../theme";

/** Labelled text input; the label doubles as the accessibility label. */
export function Field({ label, error, hint, ...input }: { label: string; error?: string | null; hint?: string } & TextInputProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.textSubtle}
        style={[styles.input, error ? styles.inputError : null]}
        {...input}
      />
      {error ? <ErrorText message={error} /> : hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

export function ErrorText({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <Text style={styles.error} accessible accessibilityRole="alert">
      {message}
    </Text>
  );
}

/** Large tappable on/off chip — easier than tiny checkboxes on small screens. */
export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress(): void }) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

export function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle} accessibilityRole="header">
        {title}
      </Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      {children}
    </View>
  );
}

export function SecondaryButton({ label, onPress, disabled }: { label: string; onPress(): void; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.secondary, pressed && styles.secondaryPressed, disabled && styles.disabled]}
    >
      <Text style={styles.secondaryText}>{label}</Text>
    </Pressable>
  );
}

export const fieldStyles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space[4],
    gap: space[2],
  },
  body: { fontSize: fontSize.base, color: colors.text },
  muted: { fontSize: fontSize.sm, color: colors.textMuted },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
});

const styles = StyleSheet.create({
  field: { gap: space[1] },
  label: { fontSize: fontSize.sm, fontWeight: "600", color: colors.text },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    fontSize: fontSize.base,
    color: colors.text,
  },
  inputError: { borderColor: colors.danger },
  hint: { fontSize: fontSize.sm, color: colors.textMuted },
  error: { color: colors.danger, fontSize: fontSize.sm },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: space[3],
    minHeight: 44,
    justifyContent: "center",
  },
  chipSelected: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { fontSize: fontSize.base, color: colors.text },
  chipTextSelected: { color: colors.surface, fontWeight: "600" },
  section: { gap: space[2] },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: "600", color: colors.text },
  secondary: {
    borderWidth: 1,
    borderColor: colors.brand,
    borderRadius: radius.md,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space[4],
  },
  secondaryPressed: { backgroundColor: colors.brandSoft },
  disabled: { opacity: 0.5 },
  secondaryText: { color: colors.brandDark, fontSize: fontSize.base, fontWeight: "600" },
});
