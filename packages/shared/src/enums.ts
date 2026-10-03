/**
 * Domain enums as `const` objects + union types. They replace the Prisma
 * enums so every runtime (web, React Native, Cloud Functions) can use them
 * without a database client. Values are identical to the legacy Prisma enums
 * wherever the concept already existed.
 */

type ValueOf<T> = T[keyof T];

export const BookingStatus = {
  REQUESTED: "REQUESTED",
  MATCHING: "MATCHING",
  OFFERED: "OFFERED",
  ACCEPTED: "ACCEPTED",
  EN_ROUTE: "EN_ROUTE",
  ARRIVED: "ARRIVED",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
  CUSTOMER_CONFIRMED: "CUSTOMER_CONFIRMED",
  PAID: "PAID",
  CANCELLED: "CANCELLED",
  DISPUTED: "DISPUTED",
} as const;
export type BookingStatus = ValueOf<typeof BookingStatus>;

/**
 * Who is allowed to *trigger* a transition. "SYSTEM" means the transition
 * only ever happens as a side effect of trusted backend logic (matching,
 * payment webhooks, schedulers) — never directly from a client request.
 */
export const BookingActor = {
  SYSTEM: "SYSTEM",
  CUSTOMER: "CUSTOMER",
  TECHNICIAN: "TECHNICIAN",
  ADMIN: "ADMIN",
} as const;
export type BookingActor = ValueOf<typeof BookingActor>;

/** Where a booking (or action) originated. Business rules never branch on this. */
export const ChannelSource = {
  WEB: "WEB",
  MOBILE: "MOBILE",
  WHATSAPP: "WHATSAPP",
  ADMIN: "ADMIN",
  SYSTEM: "SYSTEM",
} as const;
export type ChannelSource = ValueOf<typeof ChannelSource>;

export const PreferredTime = {
  ASAP: "ASAP",
  TODAY: "TODAY",
  TOMORROW: "TOMORROW",
  SCHEDULED: "SCHEDULED",
} as const;
export type PreferredTime = ValueOf<typeof PreferredTime>;

export const UserStatus = {
  ACTIVE: "ACTIVE",
  SUSPENDED: "SUSPENDED",
} as const;
export type UserStatus = ValueOf<typeof UserStatus>;

/** UNSUBMITTED is new: a registered technician who has not yet sent documents. */
export const VerificationStatus = {
  UNSUBMITTED: "UNSUBMITTED",
  PENDING: "PENDING",
  VERIFIED: "VERIFIED",
  REJECTED: "REJECTED",
  SUSPENDED: "SUSPENDED",
} as const;
export type VerificationStatus = ValueOf<typeof VerificationStatus>;

export const IdDocumentType = {
  GHANA_CARD: "GHANA_CARD",
  PASSPORT: "PASSPORT",
  DRIVERS_LICENSE: "DRIVERS_LICENSE",
  VOTER_ID: "VOTER_ID",
} as const;
export type IdDocumentType = ValueOf<typeof IdDocumentType>;

export const PaymentStatus = {
  PENDING: "PENDING",
  SUCCEEDED: "SUCCEEDED",
  FAILED: "FAILED",
  REFUNDED: "REFUNDED",
  PARTIALLY_REFUNDED: "PARTIALLY_REFUNDED",
} as const;
export type PaymentStatus = ValueOf<typeof PaymentStatus>;

export const PaymentMethod = {
  MOBILE_MONEY: "MOBILE_MONEY",
  CARD: "CARD",
  CASH: "CASH",
} as const;
export type PaymentMethod = ValueOf<typeof PaymentMethod>;

export const MobileMoneyNetwork = {
  MTN_MOMO: "MTN_MOMO",
  TELECEL_CASH: "TELECEL_CASH",
  AT_MONEY: "AT_MONEY",
} as const;
export type MobileMoneyNetwork = ValueOf<typeof MobileMoneyNetwork>;

export const PayoutStatus = {
  PENDING: "PENDING",
  PROCESSING: "PROCESSING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
} as const;
export type PayoutStatus = ValueOf<typeof PayoutStatus>;

/** Ledger entry purpose. `amountMinor` is always positive; the type encodes direction. */
export const WalletTransactionType = {
  EARNING_CREDIT: "EARNING_CREDIT",
  COMMISSION_DEBIT: "COMMISSION_DEBIT",
  WITHDRAWAL_DEBIT: "WITHDRAWAL_DEBIT",
  WITHDRAWAL_REVERSAL_CREDIT: "WITHDRAWAL_REVERSAL_CREDIT",
  ADJUSTMENT_CREDIT: "ADJUSTMENT_CREDIT",
  ADJUSTMENT_DEBIT: "ADJUSTMENT_DEBIT",
} as const;
export type WalletTransactionType = ValueOf<typeof WalletTransactionType>;

export const CommissionScope = {
  GLOBAL: "GLOBAL",
  SERVICE: "SERVICE",
  TECHNICIAN: "TECHNICIAN",
} as const;
export type CommissionScope = ValueOf<typeof CommissionScope>;

export const DisputeStatus = {
  OPEN: "OPEN",
  UNDER_REVIEW: "UNDER_REVIEW",
  RESOLVED: "RESOLVED",
  REJECTED: "REJECTED",
} as const;
export type DisputeStatus = ValueOf<typeof DisputeStatus>;

export const DisputeRaisedBy = {
  CUSTOMER: "CUSTOMER",
  TECHNICIAN: "TECHNICIAN",
} as const;
export type DisputeRaisedBy = ValueOf<typeof DisputeRaisedBy>;

export const NotificationChannel = {
  IN_APP: "IN_APP",
  PUSH: "PUSH",
  WHATSAPP: "WHATSAPP",
  SMS: "SMS",
  EMAIL: "EMAIL",
} as const;
export type NotificationChannel = ValueOf<typeof NotificationChannel>;

export const BookingMediaKind = {
  PROBLEM: "PROBLEM",
  BEFORE: "BEFORE",
  AFTER: "AFTER",
} as const;
export type BookingMediaKind = ValueOf<typeof BookingMediaKind>;

/** WhatsApp conversation states — identical to the legacy Prisma enum. */
export const ConversationState = {
  START: "START",
  SELECT_SERVICE: "SELECT_SERVICE",
  DESCRIBE_PROBLEM: "DESCRIBE_PROBLEM",
  LOCATION: "LOCATION",
  TIME: "TIME",
  MATCHING: "MATCHING",
  SELECT_TECHNICIAN: "SELECT_TECHNICIAN",
  CONFIRM_BOOKING: "CONFIRM_BOOKING",
  BOOKING_CREATED: "BOOKING_CREATED",
  ENDED: "ENDED",
} as const;
export type ConversationState = ValueOf<typeof ConversationState>;
