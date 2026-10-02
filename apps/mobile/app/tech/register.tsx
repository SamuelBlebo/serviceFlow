import { Redirect, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text } from "react-native";
import { useAuth } from "../../src/auth/AuthProvider";
import { messageFromError } from "../../src/lib/call";
import { newRequestId } from "../../src/lib/request-id";
import { watchDisplayName } from "../../src/profile/account";
import { RegisterForm, type RegisterValues } from "../../src/technician/RegisterForm";
import { useTechnician } from "../../src/technician/TechnicianProvider";
import { fieldStyles } from "../../src/components/fields";
import { space } from "../../src/theme";

export default function TechRegisterScreen() {
  const { session, refreshSession } = useAuth();
  const { store } = useTechnician();
  const router = useRouter();
  const uid = session.status === "signedIn" ? session.uid : null;
  // One idempotency key per registration attempt, reused on retry.
  const [requestId] = useState(() => newRequestId());
  const [name, setName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) return;
    return watchDisplayName(uid, setName, () => setName(""));
  }, [uid]);

  if (session.status === "signedIn" && session.capabilities.tech && !busy) return <Redirect href="/" />;

  async function register(values: RegisterValues) {
    setBusy(true);
    setError(null);
    try {
      await store.register({ requestId, ...values });
      // The server set the `tech` claim; fetch it now instead of waiting up to an hour.
      await refreshSession();
      router.replace("/tech/work");
    } catch (e) {
      setError(messageFromError(e));
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={fieldStyles.body}>Get job requests from customers near you. After registering you'll choose your services and areas, then verify your ID.</Text>
      {name === null ? null : <RegisterForm initialName={name} busy={busy} serverError={error} onSubmit={(v) => void register(v)} />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({ content: { padding: space[4], gap: space[4] } });
