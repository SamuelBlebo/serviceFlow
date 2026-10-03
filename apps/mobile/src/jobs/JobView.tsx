import {
  BookingActor,
  BookingStatus,
  QuoteStatus,
  TECH_STEP_LABELS,
  canActorTransition,
  canAddJobPhoto,
  canSubmitQuote,
  formatMoney,
  formatMoneyRange,
  isQuoteWithinRange,
  nextTechnicianStep,
  toMinor,
} from "@serviceflow/shared";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { PrimaryButton } from "../auth/forms";
import { ErrorText, Field, SecondaryButton, Section, fieldStyles } from "../components/fields";
import { messageFromError } from "../lib/call";
import { newRequestId } from "../lib/request-id";
import type { PickPhoto } from "../technician/photos";
import { colors, fontSize, radius, space } from "../theme";
import type { Payment } from "../payments/payment-store";
import type { Job, JobContact, JobPhoto, JobStore } from "./job-store";

/** What the technician sees at each status (customer wording lives elsewhere). */
export const TECH_STATUS_LABELS: Record<BookingStatus, string> = {
  REQUESTED: "Looking for a technician",
  MATCHING: "Looking for a technician",
  OFFERED: "New job offer",
  ACCEPTED: "Accepted — set off when you're ready",
  EN_ROUTE: "On your way",
  ARRIVED: "On site",
  IN_PROGRESS: "Working",
  COMPLETED: "Finished — waiting for the customer to confirm",
  CUSTOMER_CONFIRMED: "Confirmed by the customer",
  PAID: "Paid",
  DISPUTED: "Under review by ServiceFlow",
  CANCELLED: "Cancelled",
};

export function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Google Maps turn-by-turn on Android, falling back to the maps website. */
export function navigationUrls(lat: number, lng: number): [string, string] {
  return [`google.navigation:q=${lat},${lng}`, `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`];
}

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

export interface JobViewProps {
  job: Job;
  uid: string;
  contact: JobContact | null;
  photos: JobPhoto[];
  now: number;
  store: Pick<JobStore, "respondToOffer" | "advance" | "submitQuote" | "cancel" | "addPhoto"> & { confirmCash?: (input: { requestId: string; bookingId: string }) => Promise<unknown> };
  payment?: Payment | null;
  pickPhoto: PickPhoto;
  getLocation(): Promise<{ lat: number; lng: number } | undefined>;
  openUrl(urls: string[]): void;
}

/**
 * One job, one primary action (plan §12.3): accept/decline an offer with a
 * countdown, then a single large button for the next step. The customer's
 * phone and directions appear only after acceptance (rules-enforced). Every
 * success is shown only after the server confirms.
 */
export function JobView({ job, uid, contact, photos, now, store, pickPhoto, getLocation, openUrl, payment = null }: JobViewProps) {
  const offer = useAction();
  const step = useAction();
  const quote = useAction();
  const photo = useAction();
  const cancel = useAction();
  const cash = useAction();
  const [declining, setDeclining] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [amount, setAmount] = useState("");
  const [quoteNote, setQuoteNote] = useState("");
  const [notes, setNotes] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  const p = job.pricing;
  const isOffer = job.status === BookingStatus.OFFERED && job.offeredTechnicianId === uid;
  const assigned = job.technicianId === uid;
  const msLeft = job.offerExpiresAt ? job.offerExpiresAt.toMillis() - now : 0;
  const next = assigned ? nextTechnicianStep(job.status) : null;
  const waitingForPrice = next === BookingStatus.IN_PROGRESS && p.quoteStatus !== QuoteStatus.ACCEPTED;
  const distance = job.candidates.find((c) => c.technicianId === uid)?.distanceKm;

  async function advance() {
    if (!next) return;
    const location = next === BookingStatus.EN_ROUTE ? await getLocation() : undefined;
    await step.run((requestId) =>
      store.advance({
        requestId,
        bookingId: job.id,
        to: next as "EN_ROUTE" | "ARRIVED" | "IN_PROGRESS" | "COMPLETED",
        location,
        notes: next === BookingStatus.COMPLETED ? notes.trim() || undefined : undefined,
      }),
    );
  }

  function sendQuote() {
    const cedis = Number(amount.replace(",", "."));
    if (!Number.isFinite(cedis) || cedis <= 0) return quote.setError("Enter your price in cedis, e.g. 250");
    const minor = toMinor(cedis);
    if (!isQuoteWithinRange(minor, p)) {
      return quote.setError(`Your price must be between ${formatMoneyRange(p.estimateMinMinor, p.estimateMaxMinor, p.currency)}.`);
    }
    void quote.run((requestId) => store.submitQuote({ requestId, bookingId: job.id, amountMinor: minor, note: quoteNote.trim() || undefined }));
  }

  async function addPhoto(kind: "BEFORE" | "AFTER") {
    try {
      const uri = await pickPhoto("camera", "back");
      if (!uri) return;
      await photo.run(() => store.addPhoto(job.id, kind, uri));
    } catch (e) {
      photo.setError(e instanceof Error ? e.message : "Couldn't take the photo.");
    }
  }

  return (
    <View style={{ gap: space[4] }}>
      <View style={styles.status} testID="job-status">
        <Text style={styles.statusText}>{TECH_STATUS_LABELS[job.status]}</Text>
        {isOffer ? (
          <Text style={msLeft > 0 ? styles.countdown : styles.expired} testID="countdown">
            {msLeft > 0 ? `Answer within ${formatCountdown(msLeft)}` : "This offer has expired"}
          </Text>
        ) : null}
      </View>

      <View style={fieldStyles.card}>
        <Text style={styles.title}>{job.serviceSnapshot.name}</Text>
        <Row label="Problem" value={job.problemDescription} />
        <Row label="Area" value={`${job.location.address ?? "Shared location"}${distance !== undefined ? ` · ${distance} km from your area` : ""}`} />
        <Row label="Price" value={p.quoteStatus === QuoteStatus.ACCEPTED && p.quotedMinor !== null ? `${formatMoney(p.quotedMinor, p.currency)} (agreed)` : `${formatMoneyRange(p.estimateMinMinor, p.estimateMaxMinor, p.currency)} (estimate)`} />
      </View>

      {isOffer ? (
        <View style={[fieldStyles.card, styles.highlight]} testID="offer-actions">
          {declining ? (
            <>
              <Field label="Reason (optional)" value={declineReason} onChangeText={setDeclineReason} maxLength={300} />
              <PrimaryButton
                label="Decline job"
                busy={offer.busy}
                onPress={() => void offer.run((requestId) => store.respondToOffer({ requestId, bookingId: job.id, accept: false, reason: declineReason.trim() || undefined }))}
              />
              <SecondaryButton label="Back" onPress={() => setDeclining(false)} />
            </>
          ) : (
            <>
              <PrimaryButton
                label="Accept job"
                busy={offer.busy || msLeft <= 0}
                onPress={() => void offer.run((requestId) => store.respondToOffer({ requestId, bookingId: job.id, accept: true }))}
              />
              <SecondaryButton label="Decline" disabled={offer.busy} onPress={() => setDeclining(true)} />
            </>
          )}
          <ErrorText message={offer.error} />
        </View>
      ) : null}

      {assigned && contact ? (
        <View style={fieldStyles.card} testID="contact">
          <Row label="Customer" value={contact.customerName || "Customer"} />
          {contact.directions ? <Row label="Directions" value={contact.directions} /> : null}
          {contact.ghanaPostGps ? <Row label="GhanaPost GPS" value={contact.ghanaPostGps} /> : null}
          {contact.notes ? <Row label="Notes" value={contact.notes} /> : null}
          <View style={fieldStyles.wrap}>
            {contact.customerPhone ? <SecondaryButton label="Call customer" onPress={() => openUrl([`tel:${contact.customerPhone}`])} /> : null}
            <SecondaryButton label="Navigate" onPress={() => openUrl(navigationUrls(job.location.lat, job.location.lng))} />
          </View>
        </View>
      ) : null}

      {assigned && (canSubmitQuote(job.status, p.quoteStatus) || p.quoteStatus !== QuoteStatus.NONE) ? (
        <Section title="Price">
          {p.quoteStatus === QuoteStatus.PROPOSED && p.quotedMinor !== null ? (
            <Text style={fieldStyles.body}>Waiting for the customer to accept {formatMoney(p.quotedMinor, p.currency)}.</Text>
          ) : null}
          {p.quoteStatus === QuoteStatus.REJECTED ? (
            <Text style={styles.warn}>The customer declined your price{p.quoteRejectionReason ? `: “${p.quoteRejectionReason}”` : ""}. Send a new one.</Text>
          ) : null}
          {p.quoteStatus === QuoteStatus.ACCEPTED && p.quotedMinor !== null ? (
            <Text style={fieldStyles.body}>Agreed price: {formatMoney(p.quotedMinor, p.currency)}.</Text>
          ) : null}
          {canSubmitQuote(job.status, p.quoteStatus) ? (
            <View style={fieldStyles.card}>
              <Field
                label="Your price (GH₵)"
                hint={`Between ${formatMoneyRange(p.estimateMinMinor, p.estimateMaxMinor, p.currency)}`}
                keyboardType="decimal-pad"
                value={amount}
                onChangeText={setAmount}
              />
              <Field label="What it covers (optional)" value={quoteNote} onChangeText={setQuoteNote} maxLength={300} />
              <PrimaryButton label={p.quoteStatus === QuoteStatus.PROPOSED ? "Update price" : "Send price"} busy={quote.busy} onPress={sendQuote} />
              <ErrorText message={quote.error} />
            </View>
          ) : null}
        </Section>
      ) : null}

      {assigned && (canAddJobPhoto(job.status, "BEFORE") || canAddJobPhoto(job.status, "AFTER") || photos.length > 0) ? (
        <Section title="Photos" hint="Before and after photos protect you if there's a disagreement.">
          <Text style={fieldStyles.muted} testID="photo-count">
            {photos.filter((x) => x.kind === "BEFORE").length} before · {photos.filter((x) => x.kind === "AFTER").length} after
          </Text>
          <View style={fieldStyles.wrap}>
            {canAddJobPhoto(job.status, "BEFORE") ? <SecondaryButton label="Add before photo" disabled={photo.busy} onPress={() => void addPhoto("BEFORE")} /> : null}
            {canAddJobPhoto(job.status, "AFTER") ? <SecondaryButton label="Add after photo" disabled={photo.busy} onPress={() => void addPhoto("AFTER")} /> : null}
          </View>
          <ErrorText message={photo.error} />
        </Section>
      ) : null}

      {next ? (
        <View style={{ gap: space[2] }}>
          {next === BookingStatus.COMPLETED ? <Field label="Notes for the customer (optional)" value={notes} onChangeText={setNotes} multiline maxLength={500} /> : null}
          {waitingForPrice ? <Text style={fieldStyles.muted}>Agree a price with the customer before you start the work.</Text> : null}
          <PrimaryButton label={TECH_STEP_LABELS[next] ?? "Next"} busy={step.busy || waitingForPrice} onPress={() => void advance()} />
          <ErrorText message={step.error} />
        </View>
      ) : null}

      {assigned && payment && (job.status === BookingStatus.CUSTOMER_CONFIRMED || job.status === BookingStatus.PAID) ? (
        <View style={fieldStyles.card} testID="job-payment">
          {payment.status === "SUCCEEDED" ? (
            <Text style={fieldStyles.body}>
              Paid {formatMoney(payment.amountMinor, payment.currency)}
              {payment.method === "CASH" ? " in cash. ServiceFlow's commission is taken from your wallet." : " by Mobile Money. Your earnings are in your wallet."}
            </Text>
          ) : payment.method === "CASH" && payment.cashStatus === "AWAITING_TECHNICIAN" ? (
            <>
              <Text style={fieldStyles.body}>The customer is paying {formatMoney(payment.amountMinor, payment.currency)} in cash. Confirm once you have it.</Text>
              <PrimaryButton
                label="Confirm cash received"
                busy={cash.busy}
                onPress={() => void cash.run((requestId) => store.confirmCash!({ requestId, bookingId: job.id }))}
              />
              <ErrorText message={cash.error} />
            </>
          ) : (
            <Text style={fieldStyles.muted}>Waiting for the customer to pay {formatMoney(payment.amountMinor, payment.currency)}.</Text>
          )}
        </View>
      ) : null}

      {assigned && canActorTransition(job.status, BookingStatus.CANCELLED, BookingActor.TECHNICIAN) ? (
        cancelling ? (
          <View style={fieldStyles.card}>
            <Text style={fieldStyles.muted}>Cancelling an accepted job counts against your record.</Text>
            <Field label="Reason for cancelling" value={cancelReason} onChangeText={setCancelReason} maxLength={300} />
            <PrimaryButton
              label="Cancel job"
              busy={cancel.busy}
              onPress={() => {
                if (cancelReason.trim().length < 3) return cancel.setError("Give a short reason");
                void cancel.run((requestId) => store.cancel({ requestId, bookingId: job.id, reason: cancelReason.trim() }));
              }}
            />
            <ErrorText message={cancel.error} />
          </View>
        ) : (
          <SecondaryButton label="Can't do this job" onPress={() => setCancelling(true)} />
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  status: { backgroundColor: colors.brandSoft, borderRadius: radius.md, padding: space[4], gap: space[1] },
  statusText: { fontSize: fontSize.lg, fontWeight: "600", color: colors.brandDark },
  countdown: { fontSize: fontSize.base, fontWeight: "600", color: colors.text },
  expired: { fontSize: fontSize.base, color: colors.danger },
  highlight: { borderColor: colors.brand },
  title: { fontSize: fontSize.lg, fontWeight: "600", color: colors.text },
  label: { fontSize: fontSize.xs, color: colors.textSubtle, textTransform: "uppercase" },
  warn: { fontSize: fontSize.base, color: colors.danger },
});
