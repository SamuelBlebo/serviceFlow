import type { PreferredTime } from "@serviceflow/database";

export interface CreateBookingRequestInput {
  serviceId: string;
  problemDescription: string;
  location: { lat: number; lng: number; address?: string; notes?: string };
  preferredTime: PreferredTime;
  scheduledAt?: Date;
}
