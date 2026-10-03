import { normalizeGhanaPhone } from "@serviceflow/shared";
import { logger } from "firebase-functions";
import type { InboundWhatsAppMessage, WhatsAppProvider } from "./whatsapp-provider";

const GRAPH_API_VERSION = "v20.0";

export interface MetaCloudApiConfig {
  phoneNumberId: string;
  accessToken: string;
}

/**
 * Meta WhatsApp Cloud API adapter (ported from legacy). Credentials are
 * injected from Secret Manager by the caller rather than read from a global
 * env object, so this class never touches configuration itself.
 */
export class MetaCloudApiWhatsAppProvider implements WhatsAppProvider {
  constructor(private readonly config: MetaCloudApiConfig) {
    if (!config.phoneNumberId || !config.accessToken) {
      throw new Error("Meta Cloud API provider requires a phone number id and access token");
    }
  }

  private async post(body: Record<string, unknown>): Promise<void> {
    const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${this.config.phoneNumberId}/messages`;
    const response = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.config.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", ...body }),
    });
    if (!response.ok) {
      logger.error("WhatsApp Graph API request failed", { status: response.status, body: await response.text() });
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
        components: [{ type: "body", parameters: Object.values(params).map((text) => ({ type: "text", text })) }],
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
    return parseMetaWebhook(payload);
  }
}

interface MetaMessage {
  id?: string;
  from?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  location?: { latitude?: number; longitude?: number };
  interactive?: { button_reply?: { id?: string }; list_reply?: { id?: string } };
  image?: { id?: string };
  video?: { id?: string };
}

/** Parses Meta's webhook shape (entry[].changes[].value.messages[]). Exported for tests. */
export function parseMetaWebhook(payload: unknown): InboundWhatsAppMessage[] {
  const messages: InboundWhatsAppMessage[] = [];
  const entries = (payload as { entry?: unknown } | null)?.entry;
  if (!Array.isArray(entries)) return messages;

  for (const entry of entries) {
    const changes = (entry as { changes?: unknown })?.changes;
    if (!Array.isArray(changes)) continue;
    for (const change of changes) {
      const raw = (change as { value?: { messages?: unknown } })?.value?.messages;
      if (!Array.isArray(raw)) continue;
      for (const m of raw as MetaMessage[]) {
        if (!m.id || !m.from) continue; // no id = cannot dedupe = never processed
        const from = normalizeGhanaPhone(m.from) ?? m.from;
        const timestamp = m.timestamp ? new Date(Number(m.timestamp) * 1000) : new Date();
        const base = { messageId: m.id, from, timestamp };

        if (m.type === "text") {
          messages.push({ ...base, type: "text", text: m.text?.body });
        } else if (m.type === "location" && m.location?.latitude !== undefined && m.location.longitude !== undefined) {
          messages.push({ ...base, type: "location", location: { lat: m.location.latitude, lng: m.location.longitude } });
        } else if (m.type === "interactive") {
          const id = m.interactive?.button_reply?.id ?? m.interactive?.list_reply?.id;
          messages.push({ ...base, type: "interactive_reply", interactiveId: id });
        } else if (m.type === "image") {
          messages.push({ ...base, type: "image", mediaId: m.image?.id });
        } else if (m.type === "video") {
          messages.push({ ...base, type: "video", mediaId: m.video?.id });
        }
      }
    }
  }
  return messages;
}
