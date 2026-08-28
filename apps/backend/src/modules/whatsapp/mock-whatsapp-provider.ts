import { logger } from "../../config/logger";
import type { InboundWhatsAppMessage, WhatsAppProvider } from "./whatsapp-provider.interface";

/**
 * Dev/demo provider — logs outbound messages instead of calling Meta's
 * Graph API, and parses a simplified JSON shape for inbound webhooks so the
 * whole conversation flow can be exercised with plain curl/Postman without
 * real WhatsApp Business credentials. Expected inbound webhook body:
 *
 *   { "from": "+233241234567", "type": "text", "text": "Hi" }
 *   { "from": "+233241234567", "type": "location", "location": { "lat": 5.6, "lng": -0.18 } }
 *   { "from": "+233241234567", "type": "interactive_reply", "interactiveId": "1" }
 */
export class MockWhatsAppProvider implements WhatsAppProvider {
  async sendMessage(to: string, text: string): Promise<void> {
    logger.info({ to, text }, "[MOCK WHATSAPP] outbound message");
  }

  async sendTemplate(to: string, templateName: string, params: Record<string, string>): Promise<void> {
    logger.info({ to, templateName, params }, "[MOCK WHATSAPP] outbound template");
  }

  async sendMedia(to: string, mediaUrl: string, caption?: string): Promise<void> {
    logger.info({ to, mediaUrl, caption }, "[MOCK WHATSAPP] outbound media");
  }

  async sendLocation(to: string, lat: number, lng: number, label?: string): Promise<void> {
    logger.info({ to, lat, lng, label }, "[MOCK WHATSAPP] outbound location");
  }

  receiveWebhook(payload: unknown): InboundWhatsAppMessage[] {
    const body = payload as Partial<InboundWhatsAppMessage> & { from?: string };
    if (!body || typeof body.from !== "string" || typeof body.type !== "string") {
      return [];
    }
    return [
      {
        from: body.from,
        type: body.type,
        text: body.text,
        location: body.location,
        mediaUrl: body.mediaUrl,
        interactiveId: body.interactiveId,
        timestamp: new Date(),
      },
    ];
  }
}
