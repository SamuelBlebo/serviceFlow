import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet } from "react-native";
import { useAuth } from "../../src/auth/AuthProvider";
import { RequestForm, type RequestValues } from "../../src/bookings/RequestForm";
import { type Address, bookingStore, watchAddresses, watchDefaultAddressId } from "../../src/bookings/booking-store";
import { ErrorText } from "../../src/components/fields";
import { useActiveServices } from "../../src/features/services/useActiveServices";
import { messageFromError } from "../../src/lib/call";
import { newRequestId } from "../../src/lib/request-id";
import { colors, space } from "../../src/theme";

export default function NewBookingScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const services = useActiveServices();
  const uid = session.status === "signedIn" ? session.uid : null;
  const [addresses, setAddresses] = useState<Address[] | null>(null);
  const [defaultId, setDefaultId] = useState<string | null>(null);
  // One idempotency key per request attempt: a retry can't create a second booking.
  const [requestId] = useState(() => newRequestId());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) return;
    const fail = () => setError("Couldn't load your addresses. Check your connection.");
    const unsubs = [watchAddresses(uid, setAddresses, fail), watchDefaultAddressId(uid, setDefaultId, fail)];
    return () => unsubs.forEach((u) => u());
  }, [uid]);

  async function submit(values: RequestValues) {
    setBusy(true);
    setError(null);
    try {
      const { id } = await bookingStore.create({ requestId, ...values, channel: "MOBILE" });
      router.replace({ pathname: "/bookings/[id]", params: { id } });
    } catch (e) {
      setError(messageFromError(e));
      setBusy(false);
    }
  }

  const ready = services.status === "ready" && addresses !== null;
  return (
    <ScrollView contentContainerStyle={styles.content}>
      {services.status === "error" ? <ErrorText message={services.message} /> : null}
      {!ready && !error ? <ActivityIndicator color={colors.brand} /> : null}
      {ready ? (
        <RequestForm
          services={services.services}
          addresses={addresses}
          defaultAddressId={defaultId}
          busy={busy}
          serverError={error}
          onSubmit={(v) => void submit(v)}
        />
      ) : (
        <ErrorText message={error} />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({ content: { padding: space[4], paddingBottom: space[10] } });
