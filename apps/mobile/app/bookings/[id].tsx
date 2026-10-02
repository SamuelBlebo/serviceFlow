import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet } from "react-native";
import { BookingView } from "../../src/bookings/BookingView";
import { type Booking, type HistoryEntry, bookingStore, watchBooking, watchHistory } from "../../src/bookings/booking-store";
import { ErrorText } from "../../src/components/fields";
import { colors, space } from "../../src/theme";

export default function BookingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [booking, setBooking] = useState<Booking | null | undefined>(undefined);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    const fail = () => setError("Couldn't load this booking. Check your connection.");
    const unsubs = [watchBooking(id, setBooking, fail), watchHistory(id, setHistory, fail)];
    return () => unsubs.forEach((u) => u());
  }, [id]);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      {error ? (
        <ErrorText message={error} />
      ) : booking === undefined ? (
        <ActivityIndicator color={colors.brand} />
      ) : booking === null ? (
        <ErrorText message="Booking not found." />
      ) : (
        <BookingView booking={booking} history={history} store={bookingStore} />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({ content: { padding: space[4], paddingBottom: space[10] } });
