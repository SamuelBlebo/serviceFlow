import { normalizePersonName } from "@serviceflow/shared";
import { useEffect, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { PrimaryButton } from "../auth/forms";
import { colors, fontSize, radius, space } from "../theme";

/**
 * Edit-your-name form. Validates locally with the shared rule; the save is
 * reported as done only after the server accepts it (`onSave` resolves).
 */
export function NameForm({ currentName, onSave }: { currentName: string; onSave(name: string): Promise<void> }) {
  const [name, setName] = useState(currentName);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");

  useEffect(() => setName(currentName), [currentName]);

  async function save() {
    const normalized = normalizePersonName(name);
    if (!normalized) {
      setError("Enter your name using letters only (2-80 characters)");
      return;
    }
    setError(null);
    setStatus("saving");
    try {
      await onSave(normalized);
      setStatus("saved");
    } catch {
      setError("Couldn't save your name. Check your connection and try again.");
      setStatus("idle");
    }
  }

  return (
    <View style={styles.form}>
      <Text style={styles.label}>Your name</Text>
      <TextInput
        accessibilityLabel="Your name"
        style={styles.input}
        autoComplete="name"
        textContentType="name"
        value={name}
        onChangeText={(t) => {
          setName(t);
          setStatus("idle");
        }}
        onSubmitEditing={save}
      />
      {error ? (
        <Text style={styles.error} accessible accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      {status === "saved" ? <Text style={styles.saved}>Saved</Text> : null}
      <PrimaryButton label="Save name" busy={status === "saving"} onPress={save} />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: space[2] },
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
  error: { color: colors.danger, fontSize: fontSize.sm },
  saved: { color: colors.brand, fontSize: fontSize.sm },
});
