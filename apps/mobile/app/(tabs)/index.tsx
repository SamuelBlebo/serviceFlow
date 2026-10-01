import { StyleSheet, Switch, Text, View } from "react-native";
import { ComingInStage, Screen } from "../../src/components/Screen";
import { ServiceList } from "../../src/features/services/ServiceList";
import { useActiveServices } from "../../src/features/services/useActiveServices";
import { colors, fontSize, radius, space } from "../../src/theme";

export default function HomeScreen() {
  const services = useActiveServices();

  return (
    <Screen title="Home">
      <View style={styles.statusCard}>
        <View style={{ flex: 1 }}>
          <Text style={styles.statusTitle}>You're offline for jobs</Text>
          <Text style={styles.statusBody}>Go online after your verification is approved.</Text>
        </View>
        {/* Disabled until sign-in + verification exist — never a fake toggle. */}
        <Switch value={false} disabled accessibilityLabel="Online status" />
      </View>

      <ComingInStage stage="Technician mobile workflow">
        Your current job, new requests, today's jobs and earnings will appear here.
      </ComingInStage>

      <Text style={styles.section}>Services on ServiceFlow</Text>
      <ServiceList state={services} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  statusCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    backgroundColor: colors.brandSoft,
    borderRadius: radius.md,
    padding: space[4],
  },
  statusTitle: { fontSize: fontSize.base, fontWeight: "600", color: colors.text },
  statusBody: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 },
  section: { fontSize: fontSize.lg, fontWeight: "600", color: colors.text },
});
