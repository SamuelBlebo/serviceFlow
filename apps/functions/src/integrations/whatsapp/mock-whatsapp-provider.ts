import { randomUUID } from "node:crypto";
import { logger } from "firebase-functions";
import type { InboundMessageType, InboundWhatsAppMessage, WhatsAppProvider } from "./whatsapp-provider";

/**
 * Development provider (ported from legacy): logs outbound messages and
 * accepts a simplified inbound JSON shape, e.g.
 *   { "from": "+233241234567", "type": "text", "text": "Hi" }
 * Local/emulator use only — the mock accepts unsigned webhooks.
 */
export class MockWhatsAppProvider implements WhatsAppProvider {
  async sendMessage(to: string, text: string): Promise<void> {
    logger.info("[MOCK WHATSAPP] outbound message", { to, text });
  }

  async sendTemplate(to: string, templateName: string, params: Record<string, string>): Promise<void> {
    logger.info("[MOCK WHATSAPP] outbound template", { to, templateName, params });
  }

  async sendMedia(to: string, mediaUrl: string, caption?: string): Promise<void> {
    logger.info("[MOCK WHATSAPP] outbound media", { to, mediaUrl, caption });
  }

  async sendLocation(to: string, lat: number, lng: number, label?: string): Promise<void> {
    logger.info("[MOCK WHATSAPP] outbound location", { to, lat, lng, label });
  }

  receiveWebhook(payload: unknown): InboundWhatsAppMessage[] {
    const body = payload as {
      messageId?: unknown;
      from?: unknown;
      type?: unknown;
      text?: string;
      location?: { lat: number; lng: number };
      mediaId?: string;
      interactiveId?: string;
    } | null;
    if (!body || typeof body.from !== "string" || typeof body.type !== "string") return [];
    return [
      {
        messageId: typeof body.messageId === "string" ? body.messageId : `mock_${randomUUID()}`,
        from: body.from,
        type: body.type as InboundMessageType,
        text: body.text,
        location: body.location,
        mediaId: body.mediaId,
        interactiveId: body.interactiveId,
        timestamp: new Date(),
      },
    ];
  }
}
