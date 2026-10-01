import { formatGhanaPhoneForDisplay } from "@serviceflow/shared";
import { StyleSheet, Text, View } from "react-native";
import { useAuth } from "../../src/auth/AuthProvider";
import { PrimaryButton } from "../../src/auth/forms";
import { ComingInStage, Screen } from "../../src/components/Screen";
import { colors, fontSize, radius, space } from "../../src/theme";

export default function ProfileScreen() {
  const { session, signOut } = useAuth();
  const phone = session.status === "signedIn" && session.phone ? formatGhanaPhoneForDisplay(session.phone) : null;
  const isTech = session.status === "signedIn" && session.capabilities.tech;

  return (
    <Screen title="Profile">
      <View style={styles.card}>
        <Text style={styles.label}>Signed in as</Text>
        <Text style={styles.value}>{phone ?? "Unknown number"}</Text>
        <Text style={styles.label}>Account type</Text>
        <Text style={styles.value}>{isTech ? "Service provider" : "Customer (provider registration coming soon)"}</Text>
      </View>
      <ComingInStage stage="Technician onboarding and verification">
        Your details, skills, service areas, availability and verification.
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
  label: { fontSize: fontSize.xs, color: colors.textSubtle, textTransform: "uppercase", marginTop: space[2] },
  value: { fontSize: fontSize.base, color: colors.text, fontWeight: "500" },
});
