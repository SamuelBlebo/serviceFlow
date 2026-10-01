import { PrismaClient, Role, VerificationStatus, CommissionScope } from "@prisma/client";

const prisma = new PrismaClient();

const DEFAULT_COMMISSION_PERCENT = Number(process.env.DEFAULT_COMMISSION_PERCENT ?? 15);

async function main() {
  console.log("Seeding ServiceFlow legacy database...");

  // ── Launch services (Ghana-first MVP: §5 of the spec) ──────────────────
  const services = await Promise.all(
    [
      {
        name: "Plumbing",
        slug: "plumbing",
        description: "Leak repairs, pipe installation, drainage, fittings.",
        basePriceMin: 100,
        basePriceMax: 400,
      },
      {
        name: "Electrical",
        slug: "electrical",
        description: "Wiring, sockets, breakers, lighting, electrical faults.",
        basePriceMin: 100,
        basePriceMax: 500,
      },
      {
        name: "AC Repair & Maintenance",
        slug: "ac-repair-maintenance",
        description: "AC servicing, gas top-up, installation, fault diagnosis.",
        basePriceMin: 150,
        basePriceMax: 600,
      },
    ].map((service) =>
      prisma.service.upsert({
        where: { slug: service.slug },
        update: {},
        create: service,
      }),
    ),
  );

  // ── Global commission (configurable, not hard-coded) ────────────────────
  const existingGlobalCommission = await prisma.commission.findFirst({
    where: { scope: CommissionScope.GLOBAL, isActive: true },
  });
  if (!existingGlobalCommission) {
    await prisma.commission.create({
      data: {
        scope: CommissionScope.GLOBAL,
        percent: DEFAULT_COMMISSION_PERCENT,
        isActive: true,
      },
    });
  }

  // ── Bootstrap admin ──────────────────────────────────────────────────────
  const adminEmail = process.env.ADMIN_BOOTSTRAP_EMAIL ?? "admin@serviceflow.dev";
  const adminExists = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!adminExists) {
    // Password hashing lives in the backend's auth module; the seed only
    // needs a placeholder hash marker so this account is unusable until the
    // backend's admin bootstrap script (or an explicit reset) sets a real one.
    await prisma.user.create({
      data: {
        phone: "+233000000000",
        email: adminEmail,
        passwordHash: null,
        role: Role.ADMIN,
      },
    });
    console.log(`Created placeholder admin ${adminEmail} — set a password via the backend auth bootstrap script.`);
  }

  // ── Sample verified technicians around Accra ────────────────────────────
  const technicianSeeds = [
    {
      phone: "+233241000001",
      fullName: "Kwame Owusu",
      serviceSlug: "plumbing",
      area: { name: "East Legon", lat: 5.6494, lng: -0.1531 },
      rating: 4.9,
      completedJobs: 127,
    },
    {
      phone: "+233241000002",
      fullName: "Ama Serwaa",
      serviceSlug: "plumbing",
      area: { name: "Osu", lat: 5.5558, lng: -0.1793 },
      rating: 4.8,
      completedJobs: 89,
    },
    {
      phone: "+233241000003",
      fullName: "Yaw Mensah",
      serviceSlug: "electrical",
      area: { name: "Adenta", lat: 5.7089, lng: -0.1666 },
      rating: 4.7,
      completedJobs: 63,
    },
    {
      phone: "+233241000004",
      fullName: "Efua Boateng",
      serviceSlug: "ac-repair-maintenance",
      area: { name: "Cantonments", lat: 5.5719, lng: -0.1808 },
      rating: 4.9,
      completedJobs: 104,
    },
  ];

  for (const seed of technicianSeeds) {
    const service = services.find((s) => s.slug === seed.serviceSlug);
    if (!service) continue;

    const user = await prisma.user.upsert({
      where: { phone: seed.phone },
      update: {},
      create: { phone: seed.phone, role: Role.TECHNICIAN },
    });

    const technicianProfile = await prisma.technicianProfile.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        fullName: seed.fullName,
        yearsExperience: 3,
        verificationStatus: VerificationStatus.VERIFIED,
        isAvailable: true,
        averageRating: seed.rating,
        completedJobs: seed.completedJobs,
        offeredJobs: seed.completedJobs + 5,
        respondedJobs: seed.completedJobs + 4,
      },
    });

    await prisma.technicianService.upsert({
      where: {
        technicianProfileId_serviceId: {
          technicianProfileId: technicianProfile.id,
          serviceId: service.id,
        },
      },
      update: {},
      create: {
        technicianProfileId: technicianProfile.id,
        serviceId: service.id,
        yearsExperience: 3,
      },
    });

    const existingArea = await prisma.serviceArea.findFirst({
      where: { technicianProfileId: technicianProfile.id, name: seed.area.name },
    });
    if (!existingArea) {
      await prisma.serviceArea.create({
        data: {
          technicianProfileId: technicianProfile.id,
          name: seed.area.name,
          centerLat: seed.area.lat,
          centerLng: seed.area.lng,
          radiusKm: 8,
        },
      });
    }

    for (let day = 1; day <= 6; day++) {
      const existingAvailability = await prisma.availability.findFirst({
        where: { technicianProfileId: technicianProfile.id, dayOfWeek: day },
      });
      if (!existingAvailability) {
        await prisma.availability.create({
          data: {
            technicianProfileId: technicianProfile.id,
            dayOfWeek: day,
            startTime: "08:00",
            endTime: "18:00",
          },
        });
      }
    }

    await prisma.wallet.upsert({
      where: { technicianProfileId: technicianProfile.id },
      update: {},
      create: { technicianProfileId: technicianProfile.id },
    });
  }

  // ── Sample customer for local testing ────────────────────────────────────
  const customerPhone = "+233201234567";
  const customerUser = await prisma.user.upsert({
    where: { phone: customerPhone },
    update: {},
    create: { phone: customerPhone, role: Role.CUSTOMER },
  });
  await prisma.customerProfile.upsert({
    where: { userId: customerUser.id },
    update: {},
    create: {
      userId: customerUser.id,
      fullName: "Ama Test Customer",
      defaultAddress: "East Legon, Accra",
      defaultLat: 5.6494,
      defaultLng: -0.1531,
    },
  });

  console.log("Seed complete.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
