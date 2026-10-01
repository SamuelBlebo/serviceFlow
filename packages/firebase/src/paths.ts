/**
 * Firestore collection names and path builders (SERVICEFLOW_MIGRATION_PLAN.md §8.2).
 * Every app and Cloud Function builds paths through these helpers so a typo
 * can never silently read or write the wrong collection.
 *
 * Collection names are product-neutral on purpose; branding never renames them.
 */
export const COLLECTIONS = {
  users: "users",
  customers: "customers",
  technicians: "technicians",
  technicianVerifications: "technicianVerifications",
  services: "services",
  serviceAreas: "serviceAreas",
  commissionRules: "commissionRules",
  settings: "settings",
  bookings: "bookings",
  payments: "payments",
  paymentWebhookEvents: "paymentWebhookEvents",
  wallets: "wallets",
  payouts: "payouts",
  ratings: "ratings",
  disputes: "disputes",
  notificationOutbox: "notificationOutbox",
  conversations: "conversations",
  whatsappInbound: "whatsappInbound",
  adminActions: "adminActions",
  rateLimits: "rateLimits",
  otpChallenges: "otpChallenges",
  reports: "reports",
} as const;

export type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS];

export const SUBCOLLECTIONS = {
  devices: "devices",
  notifications: "notifications",
  statusHistory: "statusHistory",
  private: "private",
  media: "media",
  messages: "messages",
  transactions: "transactions",
  addresses: "addresses",
} as const;

/** Well-known singleton documents. */
export const SETTINGS_DOCS = {
  platform: "platform",
  flags: "flags",
} as const;

function assertSegment(id: string, what: string): string {
  if (!id || id.includes("/")) {
    throw new Error(`Invalid ${what} id: "${id}"`);
  }
  return id;
}

const seg = assertSegment;

export const paths = {
  user: (uid: string) => `${COLLECTIONS.users}/${seg(uid, "user")}`,
  userDevice: (uid: string, deviceId: string) =>
    `${paths.user(uid)}/${SUBCOLLECTIONS.devices}/${seg(deviceId, "device")}`,
  userNotifications: (uid: string) => `${paths.user(uid)}/${SUBCOLLECTIONS.notifications}`,

  customer: (uid: string) => `${COLLECTIONS.customers}/${seg(uid, "customer")}`,
  customerAddresses: (uid: string) => `${paths.customer(uid)}/${SUBCOLLECTIONS.addresses}`,
  customerAddress: (uid: string, addressId: string) =>
    `${paths.customer(uid)}/${SUBCOLLECTIONS.addresses}/${seg(addressId, "address")}`,
  technician: (uid: string) => `${COLLECTIONS.technicians}/${seg(uid, "technician")}`,
  technicianVerification: (id: string) => `${COLLECTIONS.technicianVerifications}/${seg(id, "verification")}`,

  service: (id: string) => `${COLLECTIONS.services}/${seg(id, "service")}`,
  serviceArea: (id: string) => `${COLLECTIONS.serviceAreas}/${seg(id, "service area")}`,
  commissionRule: (id: string) => `${COLLECTIONS.commissionRules}/${seg(id, "commission rule")}`,
  platformSettings: () => `${COLLECTIONS.settings}/${SETTINGS_DOCS.platform}`,
  featureFlags: () => `${COLLECTIONS.settings}/${SETTINGS_DOCS.flags}`,

  booking: (id: string) => `${COLLECTIONS.bookings}/${seg(id, "booking")}`,
  bookingStatusHistory: (bookingId: string) => `${paths.booking(bookingId)}/${SUBCOLLECTIONS.statusHistory}`,
  bookingContact: (bookingId: string) => `${paths.booking(bookingId)}/${SUBCOLLECTIONS.private}/contact`,
  bookingMedia: (bookingId: string) => `${paths.booking(bookingId)}/${SUBCOLLECTIONS.media}`,
  bookingMessages: (bookingId: string) => `${paths.booking(bookingId)}/${SUBCOLLECTIONS.messages}`,

  /** One payment per booking — the booking id IS the payment id. */
  payment: (bookingId: string) => `${COLLECTIONS.payments}/${seg(bookingId, "booking")}`,
  paymentTransactions: (bookingId: string) => `${paths.payment(bookingId)}/${SUBCOLLECTIONS.transactions}`,
  paymentWebhookEvent: (provider: string, eventId: string) =>
    `${COLLECTIONS.paymentWebhookEvents}/${seg(provider, "provider")}_${seg(eventId, "event")}`,

  wallet: (uid: string) => `${COLLECTIONS.wallets}/${seg(uid, "wallet")}`,
  walletTransaction: (uid: string, entryId: string) =>
    `${paths.wallet(uid)}/${SUBCOLLECTIONS.transactions}/${seg(entryId, "ledger entry")}`,
  payout: (id: string) => `${COLLECTIONS.payouts}/${seg(id, "payout")}`,

  /** One rating per booking — the booking id IS the rating id. */
  rating: (bookingId: string) => `${COLLECTIONS.ratings}/${seg(bookingId, "booking")}`,
  dispute: (id: string) => `${COLLECTIONS.disputes}/${seg(id, "dispute")}`,

  conversation: (e164Phone: string) => `${COLLECTIONS.conversations}/${seg(e164Phone, "phone")}`,
  whatsappInbound: (messageId: string) => `${COLLECTIONS.whatsappInbound}/${seg(messageId, "message")}`,
  adminAction: (id: string) => `${COLLECTIONS.adminActions}/${seg(id, "admin action")}`,
  /** One active OTP challenge per phone (E.164). Server-only. */
  otpChallenge: (e164Phone: string) => `${COLLECTIONS.otpChallenges}/${seg(e164Phone, "phone")}`,
  rateLimit: (key: string) => `${COLLECTIONS.rateLimits}/${seg(key, "rate limit")}`,
} as const;

/** Storage object paths (§8.5). Rules enforce ownership on exactly these prefixes. */
export const storagePaths = {
  technicianProfilePhoto: (uid: string, file: string) => `technicians/${seg(uid, "technician")}/profile/${seg(file, "file")}`,
  technicianPortfolio: (uid: string, file: string) => `technicians/${seg(uid, "technician")}/portfolio/${seg(file, "file")}`,
  verificationDocument: (uid: string, submissionId: string, file: string) =>
    `verifications/${seg(uid, "technician")}/${seg(submissionId, "submission")}/${seg(file, "file")}`,
  bookingMedia: (bookingId: string, kind: string, file: string) =>
    `bookings/${seg(bookingId, "booking")}/${seg(kind, "kind")}/${seg(file, "file")}`,
  disputeEvidence: (disputeId: string, file: string) => `disputes/${seg(disputeId, "dispute")}/${seg(file, "file")}`,
} as const;
