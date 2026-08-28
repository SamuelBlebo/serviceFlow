import { env } from "../../config/env";
import { MockWhatsAppProvider } from "./mock-whatsapp-provider";
import { MetaCloudApiWhatsAppProvider } from "./meta-cloud-api-provider";
import type { WhatsAppProvider } from "./whatsapp-provider.interface";

let cached: WhatsAppProvider | null = null;

export function getWhatsAppProvider(): WhatsAppProvider {
  if (cached) return cached;
  switch (env.WHATSAPP_PROVIDER) {
    case "meta_cloud_api":
      cached = new MetaCloudApiWhatsAppProvider();
      break;
    case "mock":
    default:
      cached = new MockWhatsAppProvider();
      break;
  }
  return cached;
}
