import {
  CommissionScope,
  DEFAULT_PLATFORM_SETTINGS,
  type CommissionRuleDoc,
  type CustomerAddressDoc,
  type CustomerDoc,
  type PlatformSettingsDoc,
  type ServiceAreaDoc,
  type ServiceDoc,
  type TechnicianDoc,
  type TimestampLike,
  type UserDoc,
  UserStatus,
  VerificationStatus,
  type WalletDoc,
  toMinor,
} from "@serviceflow/shared";

/**
 * Development seed data for the emulators. Pure (no Firebase imports) so a
 * unit test can validate every document against the shared schemas.
 * Ported from the legacy Prisma seed and expanded with Accra service areas.
 */

export const SERVICES: Array<{ id: string; doc: ServiceDoc }> = [
  {
    id: "plumbing",
    doc: {
      name: "Plumbing",
      slug: "plumbing",
      description: "Leak repairs, pipe installation, drainage and fittings.",
      iconPath: null,
      priceRange: { minMinor: toMinor(100), maxMinor: toMinor(400) },
      isActive: true,
      sortOrder: 1,
    },
  },
  {
    id: "electrical",
    doc: {
      name: "Electrical",
      slug: "electrical",
      description: "Wiring, sockets, breakers, lighting and electrical faults.",
      iconPath: null,
      priceRange: { minMinor: toMinor(100), maxMinor: toMinor(500) },
      isActive: true,
      sortOrder: 2,
    },
  },
  {
    id: "ac-repair-maintenance",
    doc: {
      name: "AC Repair & Maintenance",
      slug: "ac-repair-maintenance",
      description: "AC servicing, gas top-up, installation and fault diagnosis.",
      iconPath: null,
      priceRange: { minMinor: toMinor(150), maxMinor: toMinor(600) },
      isActive: true,
      sortOrder: 3,
    },
  },
];

type AreaSeed = [id: string, name: string, lat: number, lng: number, city?: string, region?: string, radiusKm?: number];

// Approximate neighbourhood centres. The first four keep the legacy seed's coordinates.
const AREA_SEEDS: AreaSeed[] = [
  ["east-legon", "East Legon", 5.6494, -0.1531],
  ["osu", "Osu", 5.5558, -0.1793],
  ["adenta", "Adenta", 5.7089, -0.1666],
  ["cantonments", "Cantonments", 5.5719, -0.1808],
  ["airport-residential", "Airport Residential", 5.603, -0.178],
  ["labone", "Labone", 5.5647, -0.1706],
  ["madina", "Madina", 5.6829, -0.168],
  ["spintex", "Spintex", 5.63, -0.1],
  ["tema", "Tema", 5.6698, -0.0166, "Tema", "Greater Accra", 10],
  ["dansoman", "Dansoman", 5.55, -0.27],
  ["achimota", "Achimota", 5.62, -0.23],
  ["lapaz", "Lapaz", 5.606, -0.253],
  ["teshie", "Teshie", 5.585, -0.103],
  ["nungua", "Nungua", 5.601, -0.077],
  ["kasoa", "Kasoa", 5.534, -0.424, "Kasoa", "Central", 10],
  ["dzorwulu", "Dzorwulu", 5.61, -0.202],
  ["haatso", "Haatso", 5.67, -0.2],
];

export const SERVICE_AREAS: Array<{ id: string; doc: ServiceAreaDoc }> = AREA_SEEDS.map(
  ([id, name, lat, lng, city = "Accra", region = "Greater Accra", radiusKm = 8]) => ({
    id,
    doc: { name, city, region, country: "GH", center: { lat, lng }, defaultRadiusKm: radiusKm, isActive: true },
  }),
);

export const PLATFORM_SETTINGS: PlatformSettingsDoc = DEFAULT_PLATFORM_SETTINGS;

export const FEATURE_FLAGS = { paymentsEnabled: false, whatsappEnabled: false, cashAllowed: true };

export function globalCommissionRule(now: TimestampLike): { id: string; doc: CommissionRuleDoc } {
  return {
    id: "global-default",
    doc: {
      scope: CommissionScope.GLOBAL,
      serviceId: null,
      technicianId: null,
      percent: DEFAULT_PLATFORM_SETTINGS.defaultCommissionPercent,
      isActive: true,
      createdAt: now,
    },
  };
}

interface TechnicianSeed {
  uid: string;
  phone: string;
  displayName: string;
  serviceId: string;
  areaId: string;
  rating: number;
  completedJobs: number;
}

const TECHNICIAN_SEEDS: TechnicianSeed[] = [
  { uid: "seed-tech-kwame", phone: "+233241000001", displayName: "Kwame Owusu", serviceId: "plumbing", areaId: "east-legon", rating: 4.9, completedJobs: 127 },
  { uid: "seed-tech-ama", phone: "+233241000002", displayName: "Ama Serwaa", serviceId: "plumbing", areaId: "osu", rating: 4.8, completedJobs: 89 },
  { uid: "seed-tech-yaw", phone: "+233241000003", displayName: "Yaw Mensah", serviceId: "electrical", areaId: "adenta", rating: 4.7, completedJobs: 63 },
  { uid: "seed-tech-efua", phone: "+233241000004", displayName: "Efua Boateng", serviceId: "ac-repair-maintenance", areaId: "cantonments", rating: 4.9, completedJobs: 104 },
];

const MON_TO_SAT_8_TO_6 = [1, 2, 3, 4, 5, 6].map((day) => ({ day, start: "08:00", end: "18:00" }));

export interface SeedAccount<Profile> {
  uid: string;
  phone: string;
  claims: Record<string, true>;
  user: UserDoc;
  profile: Profile;
}

export function technicianAccounts(
  now: TimestampLike,
): Array<SeedAccount<TechnicianDoc & { searchKeywords: string[] }> & { wallet: WalletDoc }> {
  return TECHNICIAN_SEEDS.map((t) => {
    const area = SERVICE_AREAS.find((a) => a.id === t.areaId);
    if (!area) throw new Error(`Unknown seed area ${t.areaId}`);
    const ratingCount = t.completedJobs;
    return {
      uid: t.uid,
      phone: t.phone,
      claims: { tech: true },
      user: {
        phone: t.phone,
        email: null,
        displayName: t.displayName,
        status: UserStatus.ACTIVE,
        capabilities: { tech: true, admin: false },
        createdAt: now,
      },
      profile: {
        displayName: t.displayName,
        photoPath: null,
        bio: `${t.displayName} — verified ServiceFlow professional (development seed).`,
        yearsExperience: 3,
        serviceIds: [t.serviceId],
        serviceAreas: [
          { name: area.doc.name, lat: area.doc.center.lat, lng: area.doc.center.lng, radiusKm: 8, areaId: area.id },
        ],
        weeklyAvailability: MON_TO_SAT_8_TO_6,
        isOnline: true,
        verificationStatus: VerificationStatus.VERIFIED,
        stats: {
          ratingSum: Math.round(t.rating * ratingCount),
          ratingCount,
          avgRating: t.rating,
          completed: t.completedJobs,
          cancelled: 0,
          offered: t.completedJobs + 5,
          responded: t.completedJobs + 4,
        },
        activeBookingId: null,
        createdAt: now,
        searchKeywords: t.displayName.toLowerCase().split(/\s+/),
      },
      wallet: {
        availableMinor: 0,
        pendingPayoutMinor: 0,
        lifetimeEarningsMinor: 0,
        currency: "GHS",
        lastEntryId: null,
        entryCount: 0,
        updatedAt: now,
      },
    };
  });
}

export function customerAccounts(
  now: TimestampLike,
): Array<SeedAccount<CustomerDoc> & { addresses: Array<{ id: string; doc: CustomerAddressDoc }> }> {
  return [
    {
      uid: "seed-customer-ama",
      phone: "+233201234567",
      claims: {},
      user: {
        phone: "+233201234567",
        email: null,
        displayName: "Ama Test Customer",
        status: UserStatus.ACTIVE,
        capabilities: { tech: false, admin: false },
        createdAt: now,
      },
      profile: {
        fullName: "Ama Test Customer",
        defaultAddressId: "home",
        createdAt: now,
        updatedAt: now,
      },
      addresses: [
        {
          id: "home",
          doc: {
            label: "Home",
            directions: "Behind the A&C Mall, cream house with a black gate",
            ghanaPostGps: "GA-543-0125",
            areaId: "east-legon",
            areaName: "East Legon",
            location: { lat: 5.6494, lng: -0.1531 },
            notes: null,
            createdAt: now,
            updatedAt: now,
          },
        },
      ],
    },
  ];
}
