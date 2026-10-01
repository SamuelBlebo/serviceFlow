import { useNetInfo } from "@react-native-community/netinfo";
import { StyleSheet, Text, View } from "react-native";
import { colors, fontSize, space } from "../theme";

export type Connectivity = "online" | "offline" | "unknown";

/** Presentational banner — renders nothing while online (or before NetInfo has an answer). */
export function ConnectivityBannerView({ connectivity }: { connectivity: Connectivity }) {
  if (connectivity !== "offline") return null;
  return (
    <View style={styles.banner} accessible accessibilityRole="alert" accessibilityLiveRegion="polite">
      <Text style={styles.text}>You're offline. Showing saved data — actions will wait for a connection.</Text>
    </View>
  );
}

/**
 * Global connection indicator (§12.4). Technicians must always know when
 * they're offline, because critical actions (accept, status changes,
 * payouts) never pretend to succeed without the server.
 */
export function ConnectivityBanner() {
  const net = useNetInfo();
  const connectivity: Connectivity =
    net.isConnected === false || net.isInternetReachable === false ? "offline" : net.isConnected ? "online" : "unknown";
  return <ConnectivityBannerView connectivity={connectivity} />;
}

const styles = StyleSheet.create({
  banner: { backgroundColor: colors.warning, paddingHorizontal: space[4], paddingVertical: space[2] },
  text: { color: colors.surface, fontSize: fontSize.sm, fontWeight: "500" },
});
