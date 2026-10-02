import { useRouter } from "expo-router";
import { StyleSheet, Text } from "react-native";
import { ComingInStage, Screen } from "../../src/components/Screen";
import { ServiceList } from "../../src/features/services/ServiceList";
import { useActiveServices } from "../../src/features/services/useActiveServices";
import { TechnicianHome } from "../../src/technician/TechnicianHome";
import { useTechnician } from "../../src/technician/TechnicianProvider";
import { colors, fontSize } from "../../src/theme";

export default function HomeScreen() {
  const services = useActiveServices();
  const { state, store } = useTechnician();
  const router = useRouter();

  return (
    <Screen title="Home">
      <TechnicianHome state={state} onNavigate={(to) => router.push(to)} setOnline={store.setOnline} />

      {state.status === "ready" ? (
        <ComingInStage stage="Technician mobile workflow">
          Your current job, new requests, today's jobs and earnings will appear here.
        </ComingInStage>
      ) : null}

      <Text style={styles.section}>Services on ServiceFlow</Text>
      <ServiceList state={services} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { fontSize: fontSize.lg, fontWeight: "600", color: colors.text },
});
