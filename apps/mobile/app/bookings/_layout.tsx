import { Redirect, Stack } from "expo-router";
import { useAuth } from "../../src/auth/AuthProvider";
import { colors } from "../../src/theme";

/** Customer booking screens, pushed over the tabs with a back button. */
export default function BookingsLayout() {
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
      <Stack.Screen name="index" options={{ title: "Your bookings" }} />
      <Stack.Screen name="new" options={{ title: "Request a service" }} />
      <Stack.Screen name="[id]" options={{ title: "Booking" }} />
    </Stack>
  );
}
