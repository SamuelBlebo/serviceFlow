import Ionicons from "@expo/vector-icons/Ionicons";
import { Redirect, Tabs } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useAuth } from "../../src/auth/AuthProvider";
import type { ComponentProps } from "react";
import { colors } from "../../src/theme";

type IconName = ComponentProps<typeof Ionicons>["name"];

const TABS: Array<{ name: string; title: string; icon: IconName }> = [
  { name: "index", title: "Home", icon: "home-outline" },
  { name: "jobs", title: "Jobs", icon: "briefcase-outline" },
  { name: "earnings", title: "Earnings", icon: "wallet-outline" },
  { name: "notifications", title: "Alerts", icon: "notifications-outline" },
  { name: "profile", title: "Profile", icon: "person-outline" },
];

/** Technician-first navigation (§12.2): Home, Jobs, Earnings, Notifications, Profile. */
export default function TabsLayout() {
  const { session } = useAuth();
  if (session.status === "loading") {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }
  if (session.status === "signedOut") return <Redirect href="/phone" />;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.textSubtle,
        tabBarLabelStyle: { fontSize: 12 },
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarIcon: ({ color, size }) => <Ionicons name={tab.icon} color={color} size={size} />,
          }}
        />
      ))}
    </Tabs>
  );
}
