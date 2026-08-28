import { env } from "../../config/env";
import { logger } from "../../config/logger";
import { normalizeGhanaPhone } from "@home-service/shared";
import type { InboundWhatsAppMessage, WhatsAppProvider } from "./whatsapp-provider.interface";

const GRAPH_API_VERSION = "v20.0";

/**
 * Real WhatsApp Business (Meta Cloud API) adapter. Send methods post to the
 * Graph API; receiveWebhook parses Meta's actual webhook payload shape
 * (entry[0].changes[0].value.messages[0]). This is the drop-in replacement
 * for MockWhatsAppProvider once WHATSAPP_PHONE_NUMBER_ID/ACCESS_TOKEN are set.
 */
export class MetaCloudApiWhatsAppProvider implements WhatsAppProvider {
  private assertConfigured() {
    if (!env.WHATSAPP_PHONE_NUMBER_ID || !env.WHATSAPP_ACCESS_TOKEN) {
      throw new Error(
        "WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN must be set to use the meta_cloud_api provider",
      );
    }
  }

  private async post(body: Record<string, unknown>): Promise<void> {
    this.assertConfigured();
    const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messaging_product: "whatsapp", ...body }),
    });
    if (!response.ok) {
      const errorBody = await response.text();
      logger.error({ status: response.status, errorBody }, "WhatsApp Graph API request failed");
      throw new Error(`WhatsApp send failed: ${response.status}`);
    }
  }

  async sendMessage(to: string, text: string): Promise<void> {
    await this.post({ to, type: "text", text: { body: text } });
  }

  async sendTemplate(to: string, templateName: string, params: Record<string, string>): Promise<void> {
    await this.post({
      to,
      type: "template",
      template: {
        name: templateName,
        language: { code: "en" },
        components: [
          {
            type: "body",
            parameters: Object.values(params).map((value) => ({ type: "text", text: value })),
          },
        ],
      },
    });
  }

  async sendMedia(to: string, mediaUrl: string, caption?: string): Promise<void> {
    await this.post({ to, type: "image", image: { link: mediaUrl, caption } });
  }

  async sendLocation(to: string, lat: number, lng: number, label?: string): Promise<void> {
    await this.post({ to, type: "location", location: { latitude: lat, longitude: lng, name: label } });
  }

  receiveWebhook(payload: unknown): InboundWhatsAppMessage[] {
    const messages: InboundWhatsAppMessage[] = [];
    const entries = (payload as { entry?: unknown[] })?.entry ?? [];

    for (const entry of entries) {
      const changes = (entry as { changes?: unknown[] })?.changes ?? [];
      for (const change of changes) {
        const value = (change as { value?: { messages?: unknown[] } })?.value;
        const rawMessages = value?.messages ?? [];

        for (const raw of rawMessages) {
          const m = raw as Record<string, any>;
          const from = normalizeGhanaPhone(m.from ?? "") ?? m.from;
          const timestamp = m.timestamp ? new Date(Number(m.timestamp) * 1000) : new Date();

          if (m.type === "text") {
            messages.push({ from, type: "text", text: m.text?.body, timestamp });
          } else if (m.type === "location") {
            messages.push({
              from,
              type: "location",
              location: { lat: m.location?.latitude, lng: m.location?.longitude },
              timestamp,
            });
          } else if (m.type === "interactive") {
            const replyId = m.interactive?.button_reply?.id ?? m.interactive?.list_reply?.id;
            messages.push({ from, type: "interactive_reply", interactiveId: replyId, timestamp });
          } else if (m.type === "image" || m.type === "video") {
            messages.push({ from, type: m.type, mediaUrl: m[m.type]?.id, timestamp });
          }
        }
      }
    }

    return messages;
  }
}
