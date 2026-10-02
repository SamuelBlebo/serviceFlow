import { Redirect, Stack } from "expo-router";
import { useAuth } from "../../src/auth/AuthProvider";
import { colors } from "../../src/theme";

/** Provider onboarding screens, pushed over the tabs with a back button. */
export default function TechLayout() {
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
      <Stack.Screen name="register" options={{ title: "Become a provider" }} />
      <Stack.Screen name="work" options={{ title: "Services & availability" }} />
      <Stack.Screen name="verification" options={{ title: "Verification" }} />
    </Stack>
  );
}
