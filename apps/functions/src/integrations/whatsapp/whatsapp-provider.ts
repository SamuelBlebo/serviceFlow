/**
 * Abstraction over WhatsApp Business messaging (ported from legacy). The
 * conversation engine and notification dispatcher only talk to this
 * interface, never to a provider SDK or raw webhook shape.
 *
 * NOT WIRED in Stage 2 — the WhatsApp stage builds on this.
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
  /** Provider message id (Meta "wamid") — the dedupe key for webhook retries (fixes legacy defect D-4). */
  messageId: string;
  from: string;
  type: InboundMessageType;
  text?: string;
  location?: { lat: number; lng: number };
  mediaId?: string;
  interactiveId?: string;
  timestamp: Date;
}
