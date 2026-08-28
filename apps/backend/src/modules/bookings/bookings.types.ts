import type { PreferredTime } from "@home-service/database";

export interface CreateBookingRequestInput {
  serviceId: string;
  problemDescription: string;
  location: { lat: number; lng: number; address?: string; notes?: string };
  preferredTime: PreferredTime;
  scheduledAt?: Date;
}
