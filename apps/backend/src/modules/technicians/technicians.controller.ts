import type { Request, Response } from "express";
import { z } from "zod";
import { VerificationStatus } from "@serviceflow/database";
import { requireParam } from "../../common/http/params";
import * as techniciansService from "./technicians.service";
import * as bookingsService from "../bookings/bookings.service";
import * as walletService from "../wallet/wallet.service";

function userId(req: Request): string {
  return req.auth!.userId;
}

// ── Self-service (technician app) ────────────────────────────────────────

const createProfileSchema = z.object({
  fullName: z.string().min(2),
  bio: z.string().optional(),
  yearsExperience: z.number().int().nonnegative().optional(),
  profilePhotoUrl: z.string().url().optional(),
});

export async function createOwnProfile(req: Request, res: Response) {
  const input = createProfileSchema.parse(req.body);
  const profile = await techniciansService.getOrCreateProfile(userId(req), input);
  res.status(201).json({ profile });
}

export async function getOwnProfile(req: Request, res: Response) {
  const profile = await techniciansService.getOwnProfile(userId(req));
  res.json({ profile });
}

const availabilityToggleSchema = z.object({ isAvailable: z.boolean() });

export async function setAvailabilityToggle(req: Request, res: Response) {
  const { isAvailable } = availabilityToggleSchema.parse(req.body);
  const profile = await techniciansService.setAvailabilityToggle(userId(req), isAvailable);
  res.json({ profile });
}

const addServiceSchema = z.object({ serviceId: z.string().uuid(), yearsExperience: z.number().int().nonnegative().optional() });

export async function addService(req: Request, res: Response) {
  const { serviceId, yearsExperience } = addServiceSchema.parse(req.body);
  const technicianService = await techniciansService.addService(userId(req), serviceId, yearsExperience);
  res.status(201).json({ technicianService });
}

const addServiceAreaSchema = z.object({
  name: z.string().min(2),
  lat: z.number(),
  lng: z.number(),
  radiusKm: z.number().positive().optional(),
});

export async function addServiceArea(req: Request, res: Response) {
  const input = addServiceAreaSchema.parse(req.body);
  const area = await techniciansService.addServiceArea(userId(req), input);
  res.status(201).json({ area });
}

const availabilityWindowSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
});

export async function setAvailabilityWindow(req: Request, res: Response) {
  const input = availabilityWindowSchema.parse(req.body);
  const window = await techniciansService.setAvailabilityWindow(userId(req), input);
  res.status(201).json({ window });
}

const verificationSchema = z.object({
  governmentIdType: z.string().min(2),
  governmentIdNumber: z.string().min(2),
  governmentIdPhotoUrl: z.string().url(),
  selfiePhotoUrl: z.string().url().optional(),
});

export async function submitVerification(req: Request, res: Response) {
  const input = verificationSchema.parse(req.body);
  const verification = await techniciansService.submitVerification(userId(req), input);
  res.status(201).json({ verification });
}

const jobTabSchema = z.enum(["new", "upcoming", "active", "completed", "cancelled"]);

export async function listOwnJobs(req: Request, res: Response) {
  const tab = jobTabSchema.parse(req.query.tab ?? "new");
  const jobs = await techniciansService.listOwnJobs(userId(req), tab);
  res.json({ jobs });
}

const respondSchema = z.object({ accept: z.boolean() });

export async function respondToJob(req: Request, res: Response) {
  const { accept } = respondSchema.parse(req.body);
  const booking = await bookingsService.respondToOffer(requireParam(req, "bookingId"), userId(req), accept);
  res.json({ booking });
}

const advanceSchema = z.object({ to: z.enum(["EN_ROUTE", "ARRIVED", "IN_PROGRESS", "COMPLETED"]) });

export async function advanceJob(req: Request, res: Response) {
  const { to } = advanceSchema.parse(req.body);
  const booking = await bookingsService.advanceJobStatus(requireParam(req, "bookingId"), userId(req), to);
  res.json({ booking });
}

export async function getWallet(req: Request, res: Response) {
  const profile = await techniciansService.getOwnProfile(userId(req));
  const wallet = await walletService.getOrCreateWallet(profile.id);
  res.json({ wallet });
}

const withdrawSchema = z.object({ amount: z.number().positive() });

export async function requestWithdrawal(req: Request, res: Response) {
  const { amount } = withdrawSchema.parse(req.body);
  const profile = await techniciansService.getOwnProfile(userId(req));
  const payout = await walletService.requestWithdrawal(profile.id, amount);
  res.status(201).json({ payout });
}

// ── Admin ─────────────────────────────────────────────────────────────────

const listFilterSchema = z.object({
  status: z.nativeEnum(VerificationStatus).optional(),
  search: z.string().optional(),
});

export async function listForAdmin(req: Request, res: Response) {
  const filter = listFilterSchema.parse(req.query);
  const technicians = await techniciansService.listForAdmin(filter);
  res.json({ technicians });
}

export async function getForAdmin(req: Request, res: Response) {
  const technician = await techniciansService.getForAdmin(requireParam(req, "id"));
  res.json({ technician });
}

const reviewSchema = z.object({ notes: z.string().optional() });

export async function approve(req: Request, res: Response) {
  const { notes } = reviewSchema.parse(req.body);
  const technician = await techniciansService.approveTechnician(requireParam(req, "id"), userId(req), notes);
  res.json({ technician });
}

export async function reject(req: Request, res: Response) {
  const { notes } = reviewSchema.parse(req.body);
  const technician = await techniciansService.rejectTechnician(requireParam(req, "id"), userId(req), notes);
  res.json({ technician });
}

export async function suspend(req: Request, res: Response) {
  const { notes } = reviewSchema.parse(req.body);
  const technician = await techniciansService.suspendTechnician(requireParam(req, "id"), userId(req), notes);
  res.json({ technician });
}

export async function reactivate(req: Request, res: Response) {
  const { notes } = reviewSchema.parse(req.body);
  const technician = await techniciansService.reactivateTechnician(requireParam(req, "id"), userId(req), notes);
  res.json({ technician });
}
