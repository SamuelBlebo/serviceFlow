import { router } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from "react-native";
import { PhoneForm } from "../../src/auth/forms";
import { call, messageFromError } from "../../src/lib/call";
import { colors, fontSize, space } from "../../src/theme";

export default function PhoneScreen() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function requestCode(phone: string) {
    setBusy(true);
    setError(null);
    try {
      const result = await call("requestOtp", { phone });
      router.push({
        pathname: "/verify",
        params: { phone: result.phone, resendIn: String(result.resendInSeconds), devCode: result.devCode ?? "" },
      });
    } catch (err) {
      setError(messageFromError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.content}>
        <Text style={styles.brand}>ServiceFlow</Text>
        <Text style={styles.title} accessibilityRole="header">
          Sign in with your phone
        </Text>
        <Text style={styles.subtitle}>We will text you a 6-digit code. New here? This creates your account.</Text>
        <PhoneForm busy={busy} serverError={error} onSubmit={requestCode} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { flex: 1, padding: space[6], justifyContent: "center", gap: space[3] },
  brand: { fontSize: fontSize.base, fontWeight: "700", color: colors.brand },
  title: { fontSize: fontSize["2xl"], fontWeight: "700", color: colors.text },
  subtitle: { fontSize: fontSize.base, color: colors.textMuted, marginBottom: space[3] },
});
