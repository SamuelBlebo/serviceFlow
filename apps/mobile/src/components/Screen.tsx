import type { ReactNode } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { colors, fontSize, radius, space } from "../theme";

export function Screen({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.heading} accessibilityRole="header">
        {title}
      </Text>
      {children}
    </ScrollView>
  );
}

/** Honest placeholder naming the stage that builds the feature. */
export function ComingInStage({ stage, children }: { stage: string; children?: ReactNode }) {
  return (
    <View style={styles.notice}>
      {children ? <Text style={styles.body}>{children}</Text> : null}
      <Text style={styles.stage}>Built in the {stage} stage.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surfaceMuted },
  content: { padding: space[4], gap: space[4] },
  heading: { fontSize: fontSize["2xl"], fontWeight: "700", color: colors.text },
  notice: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space[4],
    gap: space[2],
  },
  body: { fontSize: fontSize.base, color: colors.text },
  stage: { fontSize: fontSize.sm, color: colors.textMuted },
});
