import {
  BookingStatus,
  CashStatus,
  MOBILE_MONEY_NETWORK_LABELS,
  MobileMoneyNetwork,
  PaymentMethod,
  PaymentStatus,
  formatGhanaPhoneForDisplay,
  formatMoney,
  initiatePaymentInput,
} from "@serviceflow/shared";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { PrimaryButton } from "../auth/forms";
import { Chip, ErrorText, Field, Section, fieldStyles } from "../components/fields";
import { messageFromError } from "../lib/call";
import { newRequestId } from "../lib/request-id";
import { colors, fontSize, space } from "../theme";
import type { Payment, PaymentStore } from "./payment-store";

/** The customer pays after confirming: Mobile Money prompt, or cash to the technician (if allowed). */
export function PaymentCard({
  bookingId,
  bookingStatus,
  payment,
  cashAllowed,
  accountPhone,
  store,
}: {
  bookingId: string;
  bookingStatus: BookingStatus;
  payment: Payment | null;
  cashAllowed: boolean;
  accountPhone: string | null;
  store: Pick<PaymentStore, "initiate">;
}) {
  const [method, setMethod] = useState<"MOBILE_MONEY" | "CASH">("MOBILE_MONEY");
  const [network, setNetwork] = useState<MobileMoneyNetwork>(MobileMoneyNetwork.MTN_MOMO);
  const [phone, setPhone] = useState(accountPhone ? formatGhanaPhoneForDisplay(accountPhone) : "");
  const [requestId, setRequestId] = useState(() => newRequestId());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!payment) return null;
  const amount = formatMoney(payment.amountMinor, payment.currency);

  if (payment.status === PaymentStatus.SUCCEEDED || bookingStatus === BookingStatus.PAID) {
    return (
      <View style={[fieldStyles.card, styles.done]} testID="payment-card">
        <Text style={styles.title}>Paid {amount}</Text>
        <Text style={fieldStyles.muted}>{payment.method === PaymentMethod.CASH ? "Paid in cash — confirmed by your technician." : "Paid by Mobile Money."}</Text>
      </View>
    );
  }
  if (bookingStatus !== BookingStatus.CUSTOMER_CONFIRMED) return null;

  const waitingForPhone = payment.status === PaymentStatus.PENDING && payment.method === PaymentMethod.MOBILE_MONEY && payment.attempts > 0;
  const waitingForCash = payment.status === PaymentStatus.PENDING && payment.method === PaymentMethod.CASH && payment.cashStatus === CashStatus.AWAITING_TECHNICIAN;

  async function pay() {
    const input = { requestId, bookingId, method, ...(method === PaymentMethod.MOBILE_MONEY ? { msisdn: phone, network } : {}) };
    const parsed = initiatePaymentInput.safeParse(input);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Check the details");
    setBusy(true);
    setError(null);
    try {
      await store.initiate(input);
      setRequestId(newRequestId());
    } catch (e) {
      setError(messageFromError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={fieldStyles.card} testID="payment-card">
      <Text style={styles.title}>Pay {amount}</Text>
      {waitingForPhone ? <Text style={fieldStyles.body}>Approve the payment prompt on your phone with your Mobile Money PIN. This screen updates once it goes through.</Text> : null}
      {waitingForCash ? (
        <Text style={fieldStyles.body}>Pay {amount} in cash to your technician. The booking is marked paid once they confirm they've received it.</Text>
      ) : (
        <>
          {payment.status === PaymentStatus.FAILED ? <ErrorText message={`${payment.failureReason ?? "The payment didn't go through."} You can try again.`} /> : null}
          <View style={fieldStyles.wrap}>
            <Chip label="Mobile Money" selected={method === "MOBILE_MONEY"} onPress={() => setMethod("MOBILE_MONEY")} />
            {cashAllowed ? <Chip label="Cash to the technician" selected={method === "CASH"} onPress={() => setMethod("CASH")} /> : null}
          </View>
          {method === "MOBILE_MONEY" ? (
            <>
              <Section title="Network">
                <View style={fieldStyles.wrap}>
                  {Object.values(MobileMoneyNetwork).map((n) => (
                    <Chip key={n} label={MOBILE_MONEY_NETWORK_LABELS[n]} selected={network === n} onPress={() => setNetwork(n)} />
                  ))}
                </View>
              </Section>
              <Field label="Mobile Money number" keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
            </>
          ) : null}
          <ErrorText message={error} />
          <PrimaryButton label={method === "CASH" ? "I'll pay in cash" : waitingForPhone ? "Send a new prompt" : `Pay ${amount}`} busy={busy} onPress={() => void pay()} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: fontSize.lg, fontWeight: "600", color: colors.text },
  done: { borderColor: colors.brand, gap: space[1] },
});
