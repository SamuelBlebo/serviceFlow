import {
  BOOKING_STATUS_LABELS,
  BookingActor,
  BookingStatus,
  PreferredTime,
  QuoteStatus,
  canActorTransition,
  formatMoney,
  formatMoneyRange,
} from "@serviceflow/shared";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { PrimaryButton } from "../auth/forms";
import { ErrorText, Field, SecondaryButton, Section, fieldStyles } from "../components/fields";
import { messageFromError } from "../lib/call";
import { newRequestId } from "../lib/request-id";
import { colors, fontSize, radius, space } from "../theme";
import type { Booking, BookingStore, HistoryEntry } from "./booking-store";

export function whenText(b: Pick<Booking, "preferredTime" | "scheduledAt">): string {
  if (b.preferredTime === PreferredTime.SCHEDULED && b.scheduledAt) {
    return new Date(b.scheduledAt.toMillis()).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  }
  return { ASAP: "As soon as possible", TODAY: "Later today", TOMORROW: "Tomorrow", SCHEDULED: "Scheduled" }[b.preferredTime];
}

export function priceText(b: Booking): string {
  const p = b.pricing;
  if (p.finalMinor !== null) return `${formatMoney(p.finalMinor, p.currency)} (final)`;
  if (p.quoteStatus === QuoteStatus.ACCEPTED && p.quotedMinor !== null) return `${formatMoney(p.quotedMinor, p.currency)} (agreed)`;
  return `${formatMoneyRange(p.estimateMinMinor, p.estimateMaxMinor, p.currency)} (estimate)`;
}

/** One action at a time; the request id is kept across retries so nothing applies twice. */
function useAction() {
  const [requestId, setRequestId] = useState(() => newRequestId());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(fn: (requestId: string) => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn(requestId);
      setRequestId(newRequestId());
    } catch (e) {
      setError(messageFromError(e));
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, setError, run };
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ gap: 2 }}>
      <Text style={styles.label}>{label}</Text>
      <Text style={fieldStyles.body}>{value}</Text>
    </View>
  );
}

/**
 * A customer's booking: live status, the technician's price to accept or
 * decline (Decision D4), confirmation and cancellation. Buttons appear only
 * when the shared rules allow them; the server decides again.
 */
export function BookingView({ booking, history, store }: { booking: Booking; history: HistoryEntry[]; store: Pick<BookingStore, "respondToQuote" | "confirm" | "cancel"> }) {
  const quote = useAction();
  const confirm = useAction();
  const cancel = useAction();
  const [declining, setDeclining] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const p = booking.pricing;
  const proposed = p.quoteStatus === QuoteStatus.PROPOSED && p.quotedMinor !== null;
  const canCancel = canActorTransition(booking.status, BookingStatus.CANCELLED, BookingActor.CUSTOMER);
  const searching = booking.status === BookingStatus.REQUESTED || booking.status === BookingStatus.MATCHING;

  return (
    <View style={{ gap: space[4] }}>
      <View style={styles.status} testID="booking-status">
        <Text style={styles.statusText}>{BOOKING_STATUS_LABELS[booking.status]}</Text>
        {searching ? <Text style={fieldStyles.muted}>We'll show your technician here as soon as one accepts.</Text> : null}
      </View>

      {proposed ? (
        <View style={[fieldStyles.card, styles.highlight]} testID="quote-card">
          <Text style={styles.title}>Your technician's price: {formatMoney(p.quotedMinor!, p.currency)}</Text>
          {p.quoteNote ? <Text style={fieldStyles.body}>“{p.quoteNote}”</Text> : null}
          <Text style={fieldStyles.muted}>Work starts only after you accept.</Text>
          {declining ? (
            <>
              <Field label="Why are you declining?" value={declineReason} onChangeText={setDeclineReason} maxLength={300} />
              <PrimaryButton
                label="Decline price"
                busy={quote.busy}
                onPress={() => {
                  if (declineReason.trim().length < 3) return quote.setError("Tell the technician why (for example, too expensive)");
                  void quote.run((requestId) => store.respondToQuote({ requestId, bookingId: booking.id, accept: false, reason: declineReason.trim() }));
                }}
              />
            </>
          ) : (
            <View style={fieldStyles.wrap}>
              <PrimaryButton
                label="Accept price"
                busy={quote.busy}
                onPress={() => void quote.run((requestId) => store.respondToQuote({ requestId, bookingId: booking.id, accept: true }))}
              />
              <SecondaryButton label="Decline" onPress={() => setDeclining(true)} />
            </View>
          )}
          <ErrorText message={quote.error} />
        </View>
      ) : null}

      {booking.status === BookingStatus.COMPLETED ? (
        <View style={[fieldStyles.card, styles.highlight]} testID="confirm-card">
          <Text style={styles.title}>Is the work done to your satisfaction?</Text>
          <PrimaryButton
            label="Confirm job completed"
            busy={confirm.busy}
            onPress={() => void confirm.run((requestId) => store.confirm({ requestId, bookingId: booking.id }))}
          />
          <ErrorText message={confirm.error} />
        </View>
      ) : null}

      <View style={fieldStyles.card}>
        <Row label="Problem" value={booking.problemDescription} />
        <Row label="Where" value={booking.location.address ?? "Shared location"} />
        <Row label="When" value={whenText(booking)} />
        <Row label="Price" value={priceText(booking)} />
        {booking.technicianSnapshot ? <Row label="Technician" value={booking.technicianSnapshot.displayName} /> : null}
        {booking.cancellation ? <Row label="Cancelled" value={booking.cancellation.reason} /> : null}
      </View>

      <Section title="Progress">
        {history.map((h) => (
          <Text key={h.id} style={fieldStyles.body}>
            • {BOOKING_STATUS_LABELS[h.to]}
          </Text>
        ))}
      </Section>

      {canCancel ? (
        cancelling ? (
          <View style={fieldStyles.card}>
            <Field label="Reason for cancelling" value={cancelReason} onChangeText={setCancelReason} maxLength={300} />
            <PrimaryButton
              label="Confirm cancellation"
              busy={cancel.busy}
              onPress={() => {
                if (cancelReason.trim().length < 3) return cancel.setError("Give a short reason");
                void cancel.run((requestId) => store.cancel({ requestId, bookingId: booking.id, reason: cancelReason.trim() }));
              }}
            />
            <ErrorText message={cancel.error} />
          </View>
        ) : (
          <SecondaryButton label="Cancel booking" onPress={() => setCancelling(true)} />
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  status: { backgroundColor: colors.brandSoft, borderRadius: radius.md, padding: space[4], gap: space[1] },
  statusText: { fontSize: fontSize.lg, fontWeight: "600", color: colors.brandDark },
  highlight: { borderColor: colors.brand },
  title: { fontSize: fontSize.base, fontWeight: "600", color: colors.text },
  label: { fontSize: fontSize.xs, color: colors.textSubtle, textTransform: "uppercase" },
});
