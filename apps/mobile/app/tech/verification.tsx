import { VerificationStatus, canSubmitVerification } from "@serviceflow/shared";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { PrimaryButton } from "../../src/auth/forms";
import { fieldStyles } from "../../src/components/fields";
import { messageFromError } from "../../src/lib/call";
import { newRequestId } from "../../src/lib/request-id";
import { pickPhoto } from "../../src/technician/photos";
import { STATUS_COPY } from "../../src/technician/StatusCard";
import { TechGate } from "../../src/technician/TechGate";
import { useTechnician } from "../../src/technician/TechnicianProvider";
import { VerificationForm, type VerificationValues } from "../../src/technician/VerificationForm";
import { VerificationHistory } from "../../src/technician/VerificationHistory";
import { colors, fontSize, space } from "../../src/theme";

const newAttempt = () => ({ requestId: newRequestId(), submissionId: newRequestId("sub") });

export default function TechVerificationScreen() {
  const { state, store } = useTechnician();
  const router = useRouter();
  // Stable per attempt: a retry after a dropped upload reuses the same
  // folder and idempotency key instead of creating a second submission.
  const [attempt, setAttempt] = useState(newAttempt);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (state.status !== "ready") return <TechGate state={state} />;
  const { uid, technician, verifications } = state;
  const status = technician.verificationStatus;
  const hasWork = technician.serviceIds.length > 0 && technician.serviceAreas.length > 0;
  const latest = verifications[0];

  async function submit(values: VerificationValues) {
    setBusy(true);
    setError(null);
    try {
      await store.submitVerification(uid, { ...attempt, ...values });
      setAttempt(newAttempt());
    } catch (e) {
      setError(messageFromError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={fieldStyles.card} testID="verification-status">
        <Text style={styles.title}>{STATUS_COPY[status].title}</Text>
        <Text style={fieldStyles.muted}>{status === VerificationStatus.PENDING ? "Your documents are being reviewed." : STATUS_COPY[status].body}</Text>
        {status === VerificationStatus.REJECTED && latest?.reviewNotes ? (
          <Text style={styles.reason}>Reason: {latest.reviewNotes}</Text>
        ) : null}
      </View>

      {canSubmitVerification(status) ? (
        hasWork ? (
          <VerificationForm pickPhoto={pickPhoto} busy={busy} serverError={error} onSubmit={(v) => void submit(v)} />
        ) : (
          <View style={fieldStyles.card}>
            <Text style={fieldStyles.body}>Choose your services and areas first, then submit your ID.</Text>
            <PrimaryButton label="Choose services and areas" onPress={() => router.push("/tech/work")} />
          </View>
        )
      ) : null}

      <VerificationHistory verifications={verifications} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space[4], gap: space[4], paddingBottom: space[10] },
  title: { fontSize: fontSize.base, fontWeight: "600", color: colors.text },
  reason: { fontSize: fontSize.sm, color: colors.danger },
});
