import { prisma, VerificationStatus, BookingStatus } from "@serviceflow/database";
import { NotFoundError, ValidationError } from "@serviceflow/shared";

export interface CreateTechnicianProfileInput {
  fullName: string;
  bio?: string;
  yearsExperience?: number;
  profilePhotoUrl?: string;
}

export async function getOrCreateProfile(userId: string, input?: CreateTechnicianProfileInput) {
  const existing = await prisma.technicianProfile.findUnique({ where: { userId } });
  if (existing) return existing;
  if (!input) throw new NotFoundError("TechnicianProfile for user", userId);

  return prisma.technicianProfile.create({
    data: {
      userId,
      fullName: input.fullName,
      bio: input.bio,
      yearsExperience: input.yearsExperience ?? 0,
      profilePhotoUrl: input.profilePhotoUrl,
    },
  });
}

export async function getOwnProfile(userId: string) {
  const profile = await prisma.technicianProfile.findUnique({
    where: { userId },
    include: { services: { include: { service: true } }, serviceAreas: true, availability: true, wallet: true },
  });
  if (!profile) throw new NotFoundError("TechnicianProfile for user", userId);
  return profile;
}

export async function setAvailabilityToggle(userId: string, isAvailable: boolean) {
  const profile = await getOwnProfile(userId);
  return prisma.technicianProfile.update({ where: { id: profile.id }, data: { isAvailable } });
}

export async function addService(userId: string, serviceId: string, yearsExperience = 0) {
  const profile = await getOwnProfile(userId);
  const service = await prisma.service.findUnique({ where: { id: serviceId } });
  if (!service || !service.isActive) throw new ValidationError("Selected service is not available");

  return prisma.technicianService.upsert({
    where: { technicianProfileId_serviceId: { technicianProfileId: profile.id, serviceId } },
    update: { yearsExperience },
    create: { technicianProfileId: profile.id, serviceId, yearsExperience },
  });
}

export async function addServiceArea(userId: string, area: { name: string; lat: number; lng: number; radiusKm?: number }) {
  const profile = await getOwnProfile(userId);
  return prisma.serviceArea.create({
    data: {
      technicianProfileId: profile.id,
      name: area.name,
      centerLat: area.lat,
      centerLng: area.lng,
      radiusKm: area.radiusKm ?? 10,
    },
  });
}

export async function setAvailabilityWindow(userId: string, window: { dayOfWeek: number; startTime: string; endTime: string }) {
  const profile = await getOwnProfile(userId);
  const existing = await prisma.availability.findFirst({
    where: { technicianProfileId: profile.id, dayOfWeek: window.dayOfWeek },
  });
  if (existing) {
    return prisma.availability.update({
      where: { id: existing.id },
      data: { startTime: window.startTime, endTime: window.endTime, isActive: true },
    });
  }
  return prisma.availability.create({
    data: { technicianProfileId: profile.id, ...window },
  });
}

export interface SubmitVerificationInput {
  governmentIdType: string;
  governmentIdNumber: string;
  governmentIdPhotoUrl: string;
  selfiePhotoUrl?: string;
}

export async function submitVerification(userId: string, input: SubmitVerificationInput) {
  const profile = await getOwnProfile(userId);
  const verification = await prisma.technicianVerification.create({
    data: { technicianProfileId: profile.id, ...input },
  });
  await prisma.technicianProfile.update({
    where: { id: profile.id },
    data: { verificationStatus: VerificationStatus.PENDING },
  });
  return verification;
}

const JOB_TAB_STATUSES: Record<string, BookingStatus[]> = {
  new: [BookingStatus.OFFERED],
  upcoming: [BookingStatus.ACCEPTED],
  active: [BookingStatus.EN_ROUTE, BookingStatus.ARRIVED, BookingStatus.IN_PROGRESS],
  completed: [BookingStatus.COMPLETED, BookingStatus.CUSTOMER_CONFIRMED, BookingStatus.PAID],
  cancelled: [BookingStatus.CANCELLED],
};

export async function listOwnJobs(userId: string, tab: keyof typeof JOB_TAB_STATUSES = "new") {
  const profile = await getOwnProfile(userId);
  const statuses = JOB_TAB_STATUSES[tab] ?? JOB_TAB_STATUSES.new;
  return prisma.booking.findMany({
    where: { technicianId: profile.id, status: { in: statuses }, deletedAt: null },
    include: { service: true, customer: true },
    orderBy: { createdAt: "desc" },
  });
}

// ── Admin ──────────────────────────────────────────────────────────────

export interface ListTechniciansFilter {
  status?: VerificationStatus;
  search?: string;
}

export async function listForAdmin(filter: ListTechniciansFilter) {
  return prisma.technicianProfile.findMany({
    where: {
      deletedAt: null,
      verificationStatus: filter.status,
      fullName: filter.search ? { contains: filter.search, mode: "insensitive" } : undefined,
    },
    include: { user: true, services: { include: { service: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getForAdmin(technicianProfileId: string) {
  const profile = await prisma.technicianProfile.findUnique({
    where: { id: technicianProfileId },
    include: {
      user: true,
      verifications: { orderBy: { submittedAt: "desc" } },
      services: { include: { service: true } },
      serviceAreas: true,
    },
  });
  if (!profile) throw new NotFoundError("TechnicianProfile", technicianProfileId);
  return profile;
}

export async function approveTechnician(technicianProfileId: string, adminUserId: string, notes?: string) {
  return updateVerificationStatus(technicianProfileId, VerificationStatus.VERIFIED, adminUserId, notes);
}

export async function rejectTechnician(technicianProfileId: string, adminUserId: string, notes?: string) {
  return updateVerificationStatus(technicianProfileId, VerificationStatus.REJECTED, adminUserId, notes);
}

export async function suspendTechnician(technicianProfileId: string, adminUserId: string, notes?: string) {
  return updateVerificationStatus(technicianProfileId, VerificationStatus.SUSPENDED, adminUserId, notes);
}

export async function reactivateTechnician(technicianProfileId: string, adminUserId: string, notes?: string) {
  return updateVerificationStatus(technicianProfileId, VerificationStatus.VERIFIED, adminUserId, notes);
}

async function updateVerificationStatus(
  technicianProfileId: string,
  status: VerificationStatus,
  adminUserId: string,
  notes?: string,
) {
  const profile = await prisma.technicianProfile.findUnique({ where: { id: technicianProfileId } });
  if (!profile) throw new NotFoundError("TechnicianProfile", technicianProfileId);

  return prisma.$transaction(async (tx) => {
    const updated = await tx.technicianProfile.update({
      where: { id: technicianProfileId },
      data: { verificationStatus: status, isAvailable: status === VerificationStatus.VERIFIED ? profile.isAvailable : false },
    });

    const latestVerification = await tx.technicianVerification.findFirst({
      where: { technicianProfileId },
      orderBy: { submittedAt: "desc" },
    });
    if (latestVerification && latestVerification.status === VerificationStatus.PENDING) {
      await tx.technicianVerification.update({
        where: { id: latestVerification.id },
        data: { status, reviewNotes: notes, reviewedById: adminUserId, reviewedAt: new Date() },
      });
    }

    await tx.adminAction.create({
      data: {
        adminId: adminUserId,
        actionType: `TECHNICIAN_${status}`,
        targetType: "TechnicianProfile",
        targetId: technicianProfileId,
        metadata: notes ? { notes } : undefined,
      },
    });

    return updated;
  });
}
