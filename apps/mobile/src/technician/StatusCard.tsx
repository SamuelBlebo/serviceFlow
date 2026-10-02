import { VerificationStatus, canGoOnline } from "@serviceflow/shared";
import { ActivityIndicator, StyleSheet, Switch, Text, View } from "react-native";
import { ErrorText } from "../components/fields";
import { colors, fontSize, radius, space } from "../theme";

export const STATUS_COPY: Record<VerificationStatus, { title: string; body: string }> = {
  UNSUBMITTED: { title: "Finish your registration", body: "Choose your services and areas, then submit your ID so we can verify you." },
  PENDING: { title: "We're reviewing your documents", body: "This usually takes 1–2 working days. You can go online once you're verified." },
  VERIFIED: { title: "You're verified", body: "Go online to receive job requests near you." },
  REJECTED: { title: "We couldn't verify you yet", body: "See the reason under Verification and submit new documents." },
  SUSPENDED: { title: "Your provider account is suspended", body: "You can't receive jobs. Contact ServiceFlow support if you think this is a mistake." },
};

/**
 * Home status card. The online switch exists only when the technician is
 * VERIFIED — never a fake, disabled toggle — and Firestore rules enforce
 * the same condition server-side.
 */
export function StatusCard({
  status,
  isOnline,
  busy = false,
  error,
  onToggleOnline,
}: {
  status: VerificationStatus;
  isOnline: boolean;
  busy?: boolean;
  error?: string | null;
  onToggleOnline(next: boolean): void;
}) {
  const copy = STATUS_COPY[status];
  const online = canGoOnline(status);
  const warn = status === VerificationStatus.REJECTED || status === VerificationStatus.SUSPENDED;
  return (
    <View style={[styles.card, warn && styles.warn]} testID="status-card">
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{online ? (isOnline ? "You're online for jobs" : "You're offline for jobs") : copy.title}</Text>
          <Text style={styles.body}>{online ? (isOnline ? "We'll send you requests near your areas." : copy.body) : copy.body}</Text>
        </View>
        {online ? (
          busy ? (
            <ActivityIndicator color={colors.brand} />
          ) : (
            <Switch
              accessibilityLabel="Online for jobs"
              value={isOnline}
              onValueChange={onToggleOnline}
              trackColor={{ true: colors.brand, false: colors.border }}
            />
          )
        ) : null}
      </View>
      <ErrorText message={error} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.brandSoft, borderRadius: radius.md, padding: space[4], gap: space[2] },
  warn: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.warning },
  row: { flexDirection: "row", alignItems: "center", gap: space[3] },
  title: { fontSize: fontSize.base, fontWeight: "600", color: colors.text },
  body: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 },
});
