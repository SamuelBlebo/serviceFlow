import { formatGhanaPhoneForDisplay } from "@serviceflow/shared";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useAuth } from "../../src/auth/AuthProvider";
import { PrimaryButton } from "../../src/auth/forms";
import { ComingInStage, Screen } from "../../src/components/Screen";
import { NameForm } from "../../src/profile/NameForm";
import { saveDisplayName, watchDisplayName } from "../../src/profile/account";
import { colors, fontSize, radius, space } from "../../src/theme";

export default function ProfileScreen() {
  const { session, signOut } = useAuth();
  const uid = session.status === "signedIn" ? session.uid : null;
  const [displayName, setDisplayName] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) return;
    return watchDisplayName(uid, setDisplayName, (e) => console.warn("Could not load your name", e));
  }, [uid]);

  const phone = session.status === "signedIn" && session.phone ? formatGhanaPhoneForDisplay(session.phone) : null;
  const isTech = session.status === "signedIn" && session.capabilities.tech;

  return (
    <Screen title="Profile">
      <View style={styles.card}>
        {displayName !== null && uid ? (
          <NameForm currentName={displayName} onSave={(name) => saveDisplayName(uid, name)} />
        ) : (
          <Text style={styles.muted}>Loading your details…</Text>
        )}
        <Text style={styles.label}>Phone number</Text>
        <Text style={styles.value}>{phone ?? "Unknown number"}</Text>
        <Text style={styles.label}>Account type</Text>
        <Text style={styles.value}>{isTech ? "Service provider" : "Customer (provider registration coming soon)"}</Text>
      </View>
      <ComingInStage stage="Technician onboarding and verification">
        Your skills, service areas, availability and verification.
      </ComingInStage>
      <PrimaryButton label="Sign out" onPress={() => void signOut()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space[4],
    gap: space[1],
  },
  label: { fontSize: fontSize.xs, color: colors.textSubtle, textTransform: "uppercase", marginTop: space[3] },
  value: { fontSize: fontSize.base, color: colors.text, fontWeight: "500" },
  muted: { fontSize: fontSize.sm, color: colors.textMuted },
});
