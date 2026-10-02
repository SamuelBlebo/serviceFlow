import { jobBucket } from "@serviceflow/shared";
import { StyleSheet, Text, View } from "react-native";
import { PrimaryButton } from "../auth/forms";
import { SecondaryButton, fieldStyles } from "../components/fields";
import { colors, fontSize, radius, space } from "../theme";
import type { Job } from "./job-store";
import { TECH_STATUS_LABELS, formatCountdown } from "./JobView";

/** Home for a provider: the current job first, then new requests waiting for an answer. */
export function JobsSummary({ jobs, uid, now, onOpen, onOpenJobs }: { jobs: Job[]; uid: string; now: number; onOpen(id: string): void; onOpenJobs(): void }) {
  const active = jobs.find((j) => jobBucket(j, uid) === "active");
  const offers = jobs.filter((j) => jobBucket(j, uid) === "offer" && (j.offerExpiresAt?.toMillis() ?? 0) > now);
  return (
    <View style={{ gap: space[3] }}>
      {active ? (
        <View style={styles.current} testID="current-job">
          <Text style={styles.label}>Current job</Text>
          <Text style={styles.title}>{active.serviceSnapshot.name}</Text>
          <Text style={fieldStyles.muted}>
            {TECH_STATUS_LABELS[active.status]} · {active.location.address ?? "Shared location"}
          </Text>
          <PrimaryButton label="Open current job" onPress={() => onOpen(active.id)} />
        </View>
      ) : null}
      {offers.length > 0 ? (
        <View style={[fieldStyles.card, styles.offer]} testID="new-requests">
          <Text style={styles.title}>
            {offers.length === 1 ? "1 new request" : `${offers.length} new requests`} · answer within {formatCountdown(Math.min(...offers.map((o) => o.offerExpiresAt!.toMillis() - now)))}
          </Text>
          <PrimaryButton label="See request" onPress={() => (offers.length === 1 ? onOpen(offers[0]!.id) : onOpenJobs())} />
        </View>
      ) : null}
      {!active && offers.length === 0 ? (
        <View style={fieldStyles.card}>
          <Text style={fieldStyles.body}>No current job. New requests will appear here while you're online.</Text>
          <SecondaryButton label="All jobs" onPress={onOpenJobs} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  current: { backgroundColor: colors.surface, borderColor: colors.brand, borderWidth: 2, borderRadius: radius.md, padding: space[4], gap: space[2] },
  offer: { borderColor: colors.accent, borderWidth: 2 },
  label: { fontSize: fontSize.xs, color: colors.textSubtle, textTransform: "uppercase" },
  title: { fontSize: fontSize.lg, fontWeight: "600", color: colors.text },
});
