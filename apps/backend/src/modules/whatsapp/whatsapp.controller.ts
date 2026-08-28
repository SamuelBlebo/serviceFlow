import type { Request, Response } from "express";
import { UnauthorizedError } from "@home-service/shared";
import { env } from "../../config/env";
import { logger } from "../../config/logger";
import { getWhatsAppProvider } from "./whatsapp-provider.factory";
import { verifyWhatsAppSignature } from "./whatsapp-security";
import { handleInboundMessage } from "./conversation.service";

/** Meta's webhook verification handshake (GET) — done once when you register the callback URL. */
export function verifyWebhook(req: Request, res: Response) {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    res.status(200).send(challenge);
    return;
  }
  throw new UnauthorizedError("Webhook verification failed");
}

export async function receiveWebhook(req: Request, res: Response) {
  const signature = req.header("X-Hub-Signature-256");
  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));

  if (!verifyWhatsAppSignature(rawBody, signature)) {
    throw new UnauthorizedError("Invalid webhook signature");
  }

  // Ack immediately — WhatsApp expects a fast 200 and will retry on timeout.
  // Everything after this point must not throw into asyncHandler, since the
  // response is already committed — errors are logged, not forwarded.
  res.status(200).json({ received: true });

  try {
    const provider = getWhatsAppProvider();
    const messages = provider.receiveWebhook(req.body);
    for (const message of messages) {
      await handleInboundMessage(message);
    }
  } catch (err) {
    logger.error({ err }, "Failed to process WhatsApp webhook payload after ack");
  }
}
