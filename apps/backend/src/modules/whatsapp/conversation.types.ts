import type { ConversationState, PreferredTime } from "@home-service/database";
import type { MatchCandidate } from "../matching/matching.types";
import type { InboundWhatsAppMessage, WhatsAppProvider } from "./whatsapp-provider.interface";

export interface ServiceMenuItem {
  index: number;
  serviceId: string;
  name: string;
}

/** Everything the conversation has collected so far — persisted as Conversation.context (JSON). */
export interface ConversationContext {
  serviceMenu?: ServiceMenuItem[];
  serviceId?: string;
  serviceName?: string;
  problemDescription?: string;
  location?: { lat: number; lng: number; address?: string };
  preferredTime?: PreferredTime;
  scheduledAt?: string; // ISO
  awaitingCustomTime?: boolean;
  bookingId?: string;
  candidates?: MatchCandidate[];
}

export interface ConversationHandlerParams {
  customerUserId: string;
  customerProfileId: string;
  phone: string;
  state: ConversationState;
  context: ConversationContext;
  inbound: InboundWhatsAppMessage;
  whatsapp: WhatsAppProvider;
}

export interface ConversationHandlerResult {
  nextState: ConversationState;
  context: ConversationContext;
}

export type ConversationHandler = (params: ConversationHandlerParams) => Promise<ConversationHandlerResult>;
