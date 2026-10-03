import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet } from "react-native";
import { useAuth } from "../../src/auth/AuthProvider";
import { PrimaryButton } from "../../src/auth/forms";
import { BookingList } from "../../src/bookings/BookingList";
import { type Booking, watchMyBookings } from "../../src/bookings/booking-store";
import { ErrorText } from "../../src/components/fields";
import { colors, space } from "../../src/theme";

export default function BookingsScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const uid = session.status === "signedIn" ? session.uid : null;
  const [list, setList] = useState<Booking[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) return;
    return watchMyBookings(uid, setList, () => setError("Couldn't load your bookings. Check your connection."));
  }, [uid]);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <PrimaryButton label="Request a service" onPress={() => router.push("/bookings/new")} />
      {error ? <ErrorText message={error} /> : list === null ? <ActivityIndicator color={colors.brand} /> : null}
      {list ? <BookingList bookings={list} onOpen={(id) => router.push({ pathname: "/bookings/[id]", params: { id } })} /> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({ content: { padding: space[4], gap: space[4] } });
