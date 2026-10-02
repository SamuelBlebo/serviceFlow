import { Redirect, Stack } from "expo-router";
import { useAuth } from "../../src/auth/AuthProvider";
import { colors } from "../../src/theme";

/** Technician job detail, pushed over the tabs. */
export default function JobsLayout() {
  const { session } = useAuth();
  if (session.status === "signedOut") return <Redirect href="/phone" />;
  return (
    <Stack
      screenOptions={{
        headerTintColor: colors.brandDark,
        headerStyle: { backgroundColor: colors.surface },
        contentStyle: { backgroundColor: colors.surfaceMuted },
      }}
    >
      <Stack.Screen name="[id]" options={{ title: "Job" }} />
    </Stack>
  );
}
