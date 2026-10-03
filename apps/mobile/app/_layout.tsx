import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { AuthProvider } from "../src/auth/AuthProvider";
import { ConnectivityBanner } from "../src/components/ConnectivityBanner";
import { TechnicianProvider } from "../src/technician/TechnicianProvider";
import { colors } from "../src/theme";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <TechnicianProvider>
          <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.surface }}>
            <StatusBar style="dark" />
            <ConnectivityBanner />
            <Stack screenOptions={{ headerShown: false }} />
          </SafeAreaView>
        </TechnicianProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
