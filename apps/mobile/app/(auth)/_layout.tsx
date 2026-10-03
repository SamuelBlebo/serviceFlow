import { Redirect, Stack } from "expo-router";
import { useAuth } from "../../src/auth/AuthProvider";

/** Sign-in screens. A signed-in user never sees them. */
export default function AuthLayout() {
  const { session } = useAuth();
  if (session.status === "signedIn") return <Redirect href="/" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
