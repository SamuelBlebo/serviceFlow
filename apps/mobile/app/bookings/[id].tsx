import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet } from "react-native";
import { useAuth } from "../../src/auth/AuthProvider";
import { BookingView } from "../../src/bookings/BookingView";
import { PaymentCard } from "../../src/payments/PaymentCard";
import { type Payment, paymentStore, watchCashAllowed, watchPayment } from "../../src/payments/payment-store";
import { type Booking, type HistoryEntry, bookingStore, watchBooking, watchHistory } from "../../src/bookings/booking-store";
import { ErrorText } from "../../src/components/fields";
import { colors, space } from "../../src/theme";

export default function BookingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [booking, setBooking] = useState<Booking | null | undefined>(undefined);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [cashAllowed, setCashAllowed] = useState(false);
  const { session } = useAuth();
  const confirmed = booking?.status === "CUSTOMER_CONFIRMED" || booking?.status === "PAID";

  useEffect(() => {
    if (!id || !confirmed) return;
    const unsubs = [watchPayment(id, setPayment), watchCashAllowed(setCashAllowed)];
    return () => unsubs.forEach((u) => u());
  }, [id, confirmed]);

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
        <>
          <PaymentCard
            bookingId={booking.id}
            bookingStatus={booking.status}
            payment={payment}
            cashAllowed={cashAllowed}
            accountPhone={session.status === "signedIn" ? session.phone : null}
            store={paymentStore}
          />
          <BookingView booking={booking} history={history} store={bookingStore} />
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({ content: { padding: space[4], paddingBottom: space[10] } });
