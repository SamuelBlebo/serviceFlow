import { Redirect } from "expo-router";
import { ActivityIndicator, Text, View } from "react-native";
import { ErrorText } from "../components/fields";
import { colors, space } from "../theme";
import type { TechnicianState } from "./TechnicianProvider";

/** What a provider-only screen shows until the technician profile is ready. */
export function TechGate({ state }: { state: Exclude<TechnicianState, { status: "ready" }> }) {
  if (state.status === "notTech") return <Redirect href="/tech/register" />;
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: space[4] }}>
      {state.status === "loading" ? <ActivityIndicator color={colors.brand} /> : <ErrorText message={state.message} />}
      {state.status === "loading" ? <Text accessibilityElementsHidden>Loading…</Text> : null}
    </View>
  );
}
