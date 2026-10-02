import { useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet } from "react-native";
import { messageFromError } from "../../src/lib/call";
import { newRequestId } from "../../src/lib/request-id";
import { TechGate } from "../../src/technician/TechGate";
import { useTechnician } from "../../src/technician/TechnicianProvider";
import { WorkSettingsForm, type WorkSettings } from "../../src/technician/WorkSettingsForm";
import { space } from "../../src/theme";

export default function TechWorkScreen() {
  const { state, store } = useTechnician();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (state.status !== "ready") return <TechGate state={state} />;
  const { technician } = state;

  async function save(settings: WorkSettings) {
    setBusy(true);
    setError(null);
    try {
      await store.updateServices({ requestId: newRequestId(), ...settings });
      // First-time setup continues to verification; later edits go back.
      if (technician.verificationStatus === "UNSUBMITTED") router.replace("/tech/verification");
      else router.back();
    } catch (e) {
      setError(messageFromError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <WorkSettingsForm
        services={state.services}
        areas={state.areas}
        initial={{
          serviceIds: technician.serviceIds,
          areaIds: technician.serviceAreas.map((a) => a.areaId).filter((id): id is string => Boolean(id)),
          weeklyAvailability: technician.weeklyAvailability,
        }}
        busy={busy}
        serverError={error}
        onSubmit={(s) => void save(s)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({ content: { padding: space[4], paddingBottom: space[10] } });
