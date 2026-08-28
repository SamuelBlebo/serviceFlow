/**
 * Abstraction over WhatsApp Business messaging (spec §17). The rest of the
 * app — Conversation Service, notifications — only ever talks to this
 * interface, never to a provider SDK or raw webhook shape directly.
 */
export interface WhatsAppProvider {
  sendMessage(to: string, text: string): Promise<void>;
  sendTemplate(to: string, templateName: string, params: Record<string, string>): Promise<void>;
  sendMedia(to: string, mediaUrl: string, caption?: string): Promise<void>;
  sendLocation(to: string, lat: number, lng: number, label?: string): Promise<void>;
  /** Normalizes a provider-specific webhook payload into inbound messages. */
  receiveWebhook(payload: unknown): InboundWhatsAppMessage[];
}

export type InboundMessageType = "text" | "location" | "image" | "video" | "interactive_reply";

export interface InboundWhatsAppMessage {
  from: string; // phone number, any common format — normalized downstream
  type: InboundMessageType;
  text?: string;
  location?: { lat: number; lng: number };
  mediaUrl?: string;
  interactiveId?: string;
  timestamp: Date;
}
