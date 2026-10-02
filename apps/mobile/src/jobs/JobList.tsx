import { type JobBucket, formatMoneyRange, jobBucket } from "@serviceflow/shared";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Section, fieldStyles } from "../components/fields";
import { colors, fontSize, radius, space } from "../theme";
import type { Job } from "./job-store";
import { TECH_STATUS_LABELS, formatCountdown } from "./JobView";

const SECTIONS: Array<{ bucket: JobBucket; title: string; empty?: string }> = [
  { bucket: "offer", title: "New requests", empty: "No new requests. Stay online to receive them." },
  { bucket: "active", title: "Active" },
  { bucket: "upcoming", title: "Upcoming" },
  { bucket: "done", title: "Done" },
];

function Row({ job, now, onOpen }: { job: Job; now: number; onOpen(id: string): void }) {
  const left = job.offerExpiresAt ? job.offerExpiresAt.toMillis() - now : 0;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${job.serviceSnapshot.name}, ${TECH_STATUS_LABELS[job.status]}`} onPress={() => onOpen(job.id)} style={styles.row}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.name}>{job.serviceSnapshot.name}</Text>
        <Text style={fieldStyles.muted}>
          {job.location.address ?? "Shared location"} · {formatMoneyRange(job.pricing.estimateMinMinor, job.pricing.estimateMaxMinor, job.pricing.currency)}
        </Text>
      </View>
      <Text style={styles.status}>{job.status === "OFFERED" && left > 0 ? formatCountdown(left) : TECH_STATUS_LABELS[job.status]}</Text>
    </Pressable>
  );
}

/** The Jobs tab (plan §12.2): new requests with a countdown, active, upcoming, done. */
export function JobList({ jobs, uid, now, onOpen }: { jobs: Job[]; uid: string; now: number; onOpen(id: string): void }) {
  return (
    <View style={{ gap: space[5] }}>
      {SECTIONS.map(({ bucket, title, empty }) => {
        const list = jobs.filter((j) => jobBucket(j, uid) === bucket);
        if (list.length === 0 && !empty) return null;
        return (
          <Section key={bucket} title={title}>
            {list.length === 0 ? <Text style={fieldStyles.muted}>{empty}</Text> : list.map((j) => <Row key={j.id} job={j} now={now} onOpen={onOpen} />)}
          </Section>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: space[4],
    minHeight: 56,
  },
  name: { fontSize: fontSize.base, fontWeight: "600", color: colors.text },
  status: { fontSize: fontSize.sm, color: colors.brandDark, maxWidth: 150, textAlign: "right" },
});
