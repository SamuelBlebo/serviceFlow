import { BOOKING_STATUS_LABELS, isOpenBooking } from "@serviceflow/shared";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Section, fieldStyles } from "../components/fields";
import { colors, fontSize, radius, space } from "../theme";
import type { Booking } from "./booking-store";
import { whenText } from "./BookingView";

function Row({ booking, onOpen }: { booking: Booking; onOpen(id: string): void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${booking.serviceSnapshot.name}, ${BOOKING_STATUS_LABELS[booking.status]}`}
      onPress={() => onOpen(booking.id)}
      style={styles.row}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.name}>{booking.serviceSnapshot.name}</Text>
        <Text style={fieldStyles.muted}>{whenText(booking)}</Text>
      </View>
      <Text style={styles.status}>{BOOKING_STATUS_LABELS[booking.status]}</Text>
    </Pressable>
  );
}

/** Open bookings first, then past ones. */
export function BookingList({ bookings, onOpen, openOnly = false }: { bookings: Booking[]; onOpen(id: string): void; openOnly?: boolean }) {
  const open = bookings.filter((b) => isOpenBooking(b.status));
  const past = bookings.filter((b) => !isOpenBooking(b.status));
  return (
    <View style={{ gap: space[4] }}>
      <Section title="Open bookings">
        {open.length === 0 ? <Text style={fieldStyles.muted}>No open bookings.</Text> : open.map((b) => <Row key={b.id} booking={b} onOpen={onOpen} />)}
      </Section>
      {!openOnly && past.length > 0 ? (
        <Section title="Past bookings">
          {past.map((b) => (
            <Row key={b.id} booking={b} onOpen={onOpen} />
          ))}
        </Section>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: space[4],
    minHeight: 56,
  },
  name: { fontSize: fontSize.base, fontWeight: "600", color: colors.text },
  status: { fontSize: fontSize.sm, color: colors.brandDark, maxWidth: 140, textAlign: "right" },
});
