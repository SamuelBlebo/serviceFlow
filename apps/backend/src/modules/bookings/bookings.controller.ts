import type { Request, Response } from "express";
import { z } from "zod";
import { BookingStatus, PaymentMethod } from "@serviceflow/database";
import { ForbiddenError } from "@serviceflow/shared";
import { requireParam } from "../../common/http/params";
import * as bookingsService from "./bookings.service";
import * as paymentsService from "../payments/payments.service";
import * as ratingsService from "../ratings/ratings.service";

function assertCanViewBooking(req: Request, booking: Awaited<ReturnType<typeof bookingsService.getBookingById>>) {
  const auth = req.auth!;
  if (auth.role === "ADMIN") return;
  if (auth.role === "CUSTOMER" && booking.customer.userId === auth.userId) return;
  throw new ForbiddenError("You do not have access to this booking");
}

export async function getById(req: Request, res: Response) {
  const booking = await bookingsService.getBookingById(requireParam(req, "id"));
  assertCanViewBooking(req, booking);
  res.json({ booking });
}

const confirmSchema = z.object({ finalPrice: z.number().positive().optional() });

export async function confirm(req: Request, res: Response) {
  const { finalPrice } = confirmSchema.parse(req.body);
  const booking = await bookingsService.confirmJobCompletion(requireParam(req, "id"), req.auth!.userId, finalPrice);
  res.json({ booking });
}

const cancelSchema = z.object({ reason: z.string().min(3) });

export async function cancel(req: Request, res: Response) {
  const { reason } = cancelSchema.parse(req.body);
  const actor = req.auth!.role === "ADMIN" ? "ADMIN" : req.auth!.role === "TECHNICIAN" ? "TECHNICIAN" : "CUSTOMER";
  const booking = await bookingsService.cancelBooking(requireParam(req, "id"), actor, req.auth!.userId, reason);
  res.json({ booking });
}

const paySchema = z.object({
  method: z.nativeEnum(PaymentMethod),
  customerPhone: z.string().min(1),
});

export async function pay(req: Request, res: Response) {
  const { method, customerPhone } = paySchema.parse(req.body);
  const payment = await paymentsService.initiatePaymentForBooking(requireParam(req, "id"), method, customerPhone);
  res.json({ payment });
}

const rateSchema = z.object({ score: z.number().int().min(1).max(5), comment: z.string().optional() });

export async function rate(req: Request, res: Response) {
  const { score, comment } = rateSchema.parse(req.body);
  const rating = await ratingsService.submitRating(requireParam(req, "id"), req.auth!.userId, score, comment);
  res.status(201).json({ rating });
}

const listAdminSchema = z.object({ status: z.nativeEnum(BookingStatus).optional() });

export async function listForAdmin(req: Request, res: Response) {
  const filter = listAdminSchema.parse(req.query);
  const bookings = await bookingsService.listBookingsForAdmin(filter);
  res.json({ bookings });
}

const reassignSchema = z.object({ reason: z.string().optional() });

export async function reassign(req: Request, res: Response) {
  const { reason } = reassignSchema.parse(req.body);
  const booking = await bookingsService.adminReassignBooking(requireParam(req, "id"), req.auth!.userId, reason);
  res.json({ booking });
}
