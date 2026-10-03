import { prisma, PaymentStatus, PaymentMethod, BookingStatus } from "@serviceflow/database";
import { NotFoundError, ValidationError } from "@serviceflow/shared";
import { getPaymentProvider } from "./payment-provider.factory";
import { creditEarningTx } from "../wallet/wallet.service";
import { assertActorCanTransition } from "../bookings/booking-state-machine";

/**
 * Drives a booking's Payment invoice (created at CUSTOMER_CONFIRMED, see
 * bookings.service.confirmJobCompletion) through the configured
 * PaymentProvider, then — on success — moves the booking to PAID and
 * credits the technician's wallet. All in one place so "paid" always means
 * "money moved AND booking status AND wallet balance are consistent".
 */
export async function initiatePaymentForBooking(bookingId: string, method: PaymentMethod, customerPhone: string) {
  const payment = await prisma.payment.findUnique({ where: { bookingId }, include: { booking: true } });
  if (!payment) throw new NotFoundError("Payment for booking", bookingId);
  if (payment.status === PaymentStatus.SUCCEEDED) {
    throw new ValidationError("This booking has already been paid");
  }

  const provider = getPaymentProvider();
  const result = await provider.initiatePayment({
    paymentId: payment.id,
    amount: Number(payment.amount),
    currency: payment.currency,
    customerPhone,
    method,
  });

  await prisma.paymentTransaction.create({
    data: {
      paymentId: payment.id,
      provider: process.env.PAYMENT_PROVIDER ?? "mock",
      providerReference: result.providerReference,
      method,
      status: result.status === "SUCCEEDED" ? PaymentStatus.SUCCEEDED : PaymentStatus.PENDING,
      rawResponse: result.raw as never,
      completedAt: result.status === "SUCCEEDED" ? new Date() : null,
    },
  });

  if (result.status === "SUCCEEDED") {
    return finalizeSuccessfulPayment(bookingId, payment.id);
  }

  return prisma.payment.update({ where: { id: payment.id }, data: { status: PaymentStatus.PENDING } });
}

async function finalizeSuccessfulPayment(bookingId: string, paymentId: string) {
  return prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUniqueOrThrow({ where: { id: bookingId } });
    assertActorCanTransition(booking.status, BookingStatus.PAID, "SYSTEM");

    const payment = await tx.payment.update({ where: { id: paymentId }, data: { status: PaymentStatus.SUCCEEDED } });

    await tx.booking.update({ where: { id: bookingId }, data: { status: BookingStatus.PAID } });
    await tx.bookingStatusHistory.create({
      data: { bookingId, fromStatus: booking.status, toStatus: BookingStatus.PAID, note: "Payment succeeded" },
    });

    if (booking.technicianId) {
      await creditEarningTx(tx, booking.technicianId, bookingId, Number(payment.technicianNetAmount));
    }

    return payment;
  });
}
