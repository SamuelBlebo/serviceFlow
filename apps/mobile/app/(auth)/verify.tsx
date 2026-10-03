import { formatGhanaPhoneForDisplay } from "@serviceflow/shared";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../../src/auth/AuthProvider";
import { CodeForm } from "../../src/auth/forms";
import { call, messageFromError } from "../../src/lib/call";
import { colors, fontSize, radius, space } from "../../src/theme";

export default function VerifyScreen() {
  const params = useLocalSearchParams<{ phone: string; resendIn?: string; devCode?: string }>();
  const { signInWithToken } = useAuth();
  const phone = params.phone ?? "";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devCode, setDevCode] = useState(params.devCode || undefined);
  const [resendIn, setResendIn] = useState(Number(params.resendIn ?? 0));

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  async function verify(code: string) {
    setBusy(true);
    setError(null);
    try {
      const { token } = await call("verifyOtp", { phone, code });
      // Success is shown only after the server confirms; the (auth) layout then redirects home.
      await signInWithToken(token);
    } catch (err) {
      setError(messageFromError(err));
      setBusy(false);
    }
  }

  async function resend() {
    setError(null);
    try {
      const result = await call("requestOtp", { phone });
      setResendIn(result.resendInSeconds);
      setDevCode(result.devCode);
    } catch (err) {
      setError(messageFromError(err));
    }
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.content}>
        <Text style={styles.title} accessibilityRole="header">
          Enter your code
        </Text>
        <Text style={styles.subtitle}>Sent to {formatGhanaPhoneForDisplay(phone)}</Text>
        {devCode ? <Text style={styles.devCode}>Local emulator code: {devCode}</Text> : null}
        <CodeForm busy={busy} serverError={error} onSubmit={verify} />
        <View style={styles.row}>
          <Pressable accessibilityRole="button" onPress={() => router.back()}>
            <Text style={styles.link}>Change number</Text>
          </Pressable>
          {resendIn > 0 ? (
            <Text style={styles.muted}>New code in {resendIn}s</Text>
          ) : (
            <Pressable accessibilityRole="button" onPress={resend}>
              <Text style={styles.link}>Send a new code</Text>
            </Pressable>
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { flex: 1, padding: space[6], justifyContent: "center", gap: space[3] },
  title: { fontSize: fontSize["2xl"], fontWeight: "700", color: colors.text },
  subtitle: { fontSize: fontSize.base, color: colors.textMuted, marginBottom: space[2] },
  devCode: {
    fontSize: fontSize.sm,
    color: colors.text,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.sm,
    padding: space[2],
  },
  row: { flexDirection: "row", justifyContent: "space-between", marginTop: space[2] },
  link: { fontSize: fontSize.sm, fontWeight: "600", color: colors.brand, paddingVertical: space[2] },
  muted: { fontSize: fontSize.sm, color: colors.textSubtle, paddingVertical: space[2] },
});
