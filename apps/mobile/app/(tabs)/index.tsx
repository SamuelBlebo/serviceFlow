import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useAuth } from "../../src/auth/AuthProvider";
import { BookingList } from "../../src/bookings/BookingList";
import { type Booking, watchMyBookings } from "../../src/bookings/booking-store";
import { SecondaryButton, fieldStyles } from "../../src/components/fields";
import { ComingInStage, Screen } from "../../src/components/Screen";
import { ServiceList } from "../../src/features/services/ServiceList";
import { useActiveServices } from "../../src/features/services/useActiveServices";
import { TechnicianHome } from "../../src/technician/TechnicianHome";
import { useTechnician } from "../../src/technician/TechnicianProvider";
import { colors, fontSize } from "../../src/theme";

export default function HomeScreen() {
  const services = useActiveServices();
  const { state, store } = useTechnician();
  const { session } = useAuth();
  const router = useRouter();
  const uid = session.status === "signedIn" ? session.uid : null;
  const [bookings, setBookings] = useState<Booking[]>([]);

  // Everyone is also a customer: show their open bookings.
  useEffect(() => {
    if (!uid) return;
    return watchMyBookings(uid, setBookings, (e) => console.warn("Could not load bookings", e));
  }, [uid]);

  return (
    <Screen title="Home">
      <TechnicianHome state={state} onNavigate={(to) => router.push(to)} setOnline={store.setOnline} />

      {state.status === "ready" ? (
        <ComingInStage stage="Technician mobile workflow">
          Your current job, new requests, today's jobs and earnings will appear here.
        </ComingInStage>
      ) : null}

      <View style={{ gap: 8 }}>
        <Text style={styles.section}>Need something fixed?</Text>
        <View style={fieldStyles.wrap}>
          <SecondaryButton label="Request a service" onPress={() => router.push("/bookings/new")} />
          <SecondaryButton label="Your bookings" onPress={() => router.push("/bookings")} />
        </View>
        {bookings.some((b) => b.status !== "CANCELLED") ? (
          <BookingList bookings={bookings} openOnly onOpen={(id) => router.push({ pathname: "/bookings/[id]", params: { id } })} />
        ) : null}
      </View>

      <Text style={styles.section}>Services on ServiceFlow</Text>
      <ServiceList state={services} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { fontSize: fontSize.lg, fontWeight: "600", color: colors.text },
});
