import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useAuth } from "../../src/auth/AuthProvider";
import { BookingList } from "../../src/bookings/BookingList";
import { type Booking, watchMyBookings } from "../../src/bookings/booking-store";
import { SecondaryButton, fieldStyles } from "../../src/components/fields";
import { Screen } from "../../src/components/Screen";
import { ServiceList } from "../../src/features/services/ServiceList";
import { useActiveServices } from "../../src/features/services/useActiveServices";
import { JobsSummary } from "../../src/jobs/JobsSummary";
import { type Job, watchMyJobs } from "../../src/jobs/job-store";
import { useNow } from "../../src/jobs/useNow";
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
  const [jobs, setJobs] = useState<Job[]>([]);
  const now = useNow();
  const isVerifiedTech = state.status === "ready" && state.technician.verificationStatus === "VERIFIED";

  useEffect(() => {
    if (!uid || !isVerifiedTech) return;
    return watchMyJobs(uid, setJobs, (e) => console.warn("Could not load jobs", e));
  }, [uid, isVerifiedTech]);

  // Everyone is also a customer: show their open bookings.
  useEffect(() => {
    if (!uid) return;
    return watchMyBookings(uid, setBookings, (e) => console.warn("Could not load bookings", e));
  }, [uid]);

  return (
    <Screen title="Home">
      <TechnicianHome state={state} onNavigate={(to) => router.push(to)} setOnline={store.setOnline} />

      {isVerifiedTech && uid ? (
        <JobsSummary
          jobs={jobs}
          uid={uid}
          now={now}
          onOpen={(id) => router.push({ pathname: "/job/[id]", params: { id } })}
          onOpenJobs={() => router.push("/jobs")}
        />
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
