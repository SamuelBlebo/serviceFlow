import { ID_DOCUMENT_LABELS } from "@serviceflow/shared";
import { Text, View } from "react-native";
import { Section, fieldStyles } from "../components/fields";
import type { Verification } from "./technician-store";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "In review",
  VERIFIED: "Approved",
  REJECTED: "Not approved",
};

function formatDate(ts: { toMillis(): number } | null): string {
  if (!ts) return "";
  return new Date(ts.toMillis()).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** Past submissions, newest first, with the reviewer's reason when rejected. */
export function VerificationHistory({ verifications }: { verifications: Verification[] }) {
  if (verifications.length === 0) return null;
  return (
    <Section title="Your submissions">
      {verifications.map((v) => (
        <View key={v.id} style={fieldStyles.card} testID={`submission-${v.id}`}>
          <Text style={fieldStyles.body}>
            {ID_DOCUMENT_LABELS[v.idType]} · {v.idNumber}
          </Text>
          <Text style={fieldStyles.muted}>
            {STATUS_LABEL[v.status] ?? v.status} · {formatDate(v.submittedAt)}
          </Text>
          {v.reviewNotes ? <Text style={fieldStyles.muted}>“{v.reviewNotes}”</Text> : null}
        </View>
      ))}
    </Section>
  );
}
