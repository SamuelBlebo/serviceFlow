import { VerificationStatus, canGoOnline } from "@serviceflow/shared";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { PrimaryButton } from "../auth/forms";
import { ErrorText, fieldStyles } from "../components/fields";
import { messageFromError } from "../lib/call";
import { colors, fontSize, radius, space } from "../theme";
import { StatusCard } from "./StatusCard";
import type { TechnicianState } from "./TechnicianProvider";

/**
 * The provider part of Home: an invitation for customers, the onboarding
 * checklist while unverified, and the online switch once verified.
 * Navigation and the online write are injected so it renders in tests.
 */
export function TechnicianHome({
  state,
  onNavigate,
  setOnline,
}: {
  state: TechnicianState;
  onNavigate(to: "/tech/register" | "/tech/work" | "/tech/verification"): void;
  setOnline(uid: string, isOnline: boolean): Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (state.status === "notTech") {
    return (
      <View style={styles.invite}>
        <Text style={styles.title}>Are you a plumber, electrician or technician?</Text>
        <Text style={fieldStyles.muted}>Register as a ServiceFlow provider and get job requests near you.</Text>
        <PrimaryButton label="Become a provider" onPress={() => onNavigate("/tech/register")} />
      </View>
    );
  }
  if (state.status === "loading") return <ActivityIndicator color={colors.brand} />;
  if (state.status === "error") return <ErrorText message={state.message} />;

  const { uid, technician } = state;
  const status = technician.verificationStatus;
  const hasWork = technician.serviceIds.length > 0 && technician.serviceAreas.length > 0;
  const submitted = status !== VerificationStatus.UNSUBMITTED && status !== VerificationStatus.REJECTED;

  async function toggle(next: boolean) {
    setBusy(true);
    setError(null);
    try {
      await setOnline(uid, next);
    } catch (e) {
      setError(messageFromError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: space[3] }}>
      <StatusCard status={status} isOnline={technician.isOnline} busy={busy} error={error} onToggleOnline={(n) => void toggle(n)} />
      {!canGoOnline(status) && status !== VerificationStatus.SUSPENDED ? (
        <View style={{ gap: space[2] }}>
          <Step done label="Register as a provider" />
          <Step done={hasWork} label="Choose your services, areas and hours" onPress={() => onNavigate("/tech/work")} />
          <Step
            done={submitted}
            label={status === VerificationStatus.REJECTED ? "Submit new ID documents" : "Submit your ID for verification"}
            onPress={hasWork ? () => onNavigate("/tech/verification") : undefined}
          />
        </View>
      ) : null}
    </View>
  );
}

function Step({ done, label, onPress }: { done: boolean; label: string; onPress?: () => void }) {
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={`${label}${done ? ", done" : ""}`}
      disabled={!onPress}
      onPress={onPress}
      style={styles.step}
    >
      <Text style={[styles.tick, done && styles.tickDone]}>{done ? "✓" : "○"}</Text>
      <Text style={[fieldStyles.body, { flex: 1 }]}>{label}</Text>
      {onPress ? <Text style={styles.chevron}>›</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  invite: { backgroundColor: colors.brandSoft, borderRadius: radius.md, padding: space[4], gap: space[2] },
  title: { fontSize: fontSize.base, fontWeight: "600", color: colors.text },
  step: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space[4],
    minHeight: 52,
  },
  tick: { fontSize: fontSize.lg, color: colors.textSubtle, width: 20 },
  tickDone: { color: colors.brand },
  chevron: { fontSize: fontSize.xl, color: colors.textSubtle },
});
