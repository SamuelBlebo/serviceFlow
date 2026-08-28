import { prisma, BookingStatus } from "@home-service/database";
import { ForbiddenError, NotFoundError, ValidationError } from "@home-service/shared";

/** Completes the customer journey (spec §6/§7): rate the technician after payment. */
export async function submitRating(bookingId: string, customerUserId: string, score: number, comment?: string) {
  if (!Number.isInteger(score) || score < 1 || score > 5) {
    throw new ValidationError("Rating score must be an integer from 1 to 5");
  }

  const booking = await prisma.booking.findUnique({ where: { id: bookingId }, include: { customer: true } });
  if (!booking || booking.deletedAt) throw new NotFoundError("Booking", bookingId);
  if (booking.customer.userId !== customerUserId) throw new ForbiddenError("This booking does not belong to you");
  if (!booking.technicianId) throw new ValidationError("Booking has no assigned technician");
  if (![BookingStatus.CUSTOMER_CONFIRMED, BookingStatus.PAID].includes(booking.status)) {
    throw new ValidationError("You can only rate a booking after the job is confirmed complete");
  }

  const existing = await prisma.rating.findUnique({ where: { bookingId } });
  if (existing) throw new ValidationError("This booking has already been rated");

  const technicianId = booking.technicianId;

  return prisma.$transaction(async (tx) => {
    const rating = await tx.rating.create({
      data: { bookingId, customerId: booking.customerId, technicianId, score },
    });

    if (comment) {
      await tx.review.create({ data: { ratingId: rating.id, comment } });
    }

    const agg = await tx.rating.aggregate({ where: { technicianId }, _avg: { score: true } });
    await tx.technicianProfile.update({
      where: { id: technicianId },
      data: { averageRating: agg._avg.score ?? score },
    });

    return rating;
  });
}
