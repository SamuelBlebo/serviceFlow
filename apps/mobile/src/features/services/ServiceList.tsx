import type { WithId } from "@serviceflow/firebase";
import { type ServiceDoc, formatMoneyRange } from "@serviceflow/shared";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { colors, fontSize, radius, space } from "../../theme";

export type ServicesState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; services: Array<WithId<ServiceDoc>>; fromCache?: boolean };

/** Presentational — every state is explicit; tested without Firebase. */
export function ServiceList({ state }: { state: ServicesState }) {
  if (state.status === "loading") {
    return (
      <View style={styles.center} accessibilityLabel="Loading services">
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  if (state.status === "error") {
    return (
      <View style={[styles.card, styles.errorCard]} accessible accessibilityRole="alert">
        <Text style={styles.title}>{state.message}</Text>
        <Text style={styles.muted}>Check your connection. We'll retry automatically.</Text>
      </View>
    );
  }

  if (state.services.length === 0) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>No services yet</Text>
        <Text style={styles.muted}>Services will appear here once they're published.</Text>
      </View>
    );
  }

  return (
    <View style={{ gap: space[3] }}>
      {state.fromCache && <Text style={styles.cacheNote}>Showing saved data</Text>}
      {state.services.map((s) => (
        <View key={s.id} style={styles.card}>
          <Text style={styles.title}>{s.name}</Text>
          <Text style={styles.muted}>{s.description}</Text>
          <Text style={styles.price}>{formatMoneyRange(s.priceRange.minMinor, s.priceRange.maxMinor)}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { paddingVertical: space[8], alignItems: "center" },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space[4],
    gap: space[1],
  },
  errorCard: { borderColor: colors.danger },
  title: { fontSize: fontSize.base, fontWeight: "600", color: colors.text },
  muted: { fontSize: fontSize.sm, color: colors.textMuted },
  price: { fontSize: fontSize.sm, fontWeight: "600", color: colors.text, marginTop: space[1] },
  cacheNote: { fontSize: fontSize.xs, color: colors.textSubtle },
});
