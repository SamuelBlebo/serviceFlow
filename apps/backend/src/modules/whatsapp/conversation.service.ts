import { prisma, Role, type ConversationState } from "@serviceflow/database";
import { normalizeGhanaPhone } from "@serviceflow/shared";
import { getWhatsAppProvider } from "./whatsapp-provider.factory";
import { STATE_HANDLERS } from "./conversation-handlers";
import type { ConversationContext } from "./conversation.types";
import type { InboundWhatsAppMessage } from "./whatsapp-provider.interface";
import { logger } from "../../config/logger";

/**
 * Orchestrates one inbound WhatsApp message end to end:
 *   WhatsApp → (this) → per-state handler → Booking/Matching services → DB
 *
 * This file owns conversation persistence and identity resolution; it
 * deliberately contains NO booking/matching business logic itself — that
 * all lives in conversation-handlers.ts and the services it calls. This is
 * the separation called for in spec §17 (WhatsApp adapter → Conversation
 * Service → Booking Service → Database), not one giant if/else.
 */
export async function handleInboundMessage(inbound: InboundWhatsAppMessage): Promise<void> {
  const phone = normalizeGhanaPhone(inbound.from) ?? inbound.from;
  const whatsapp = getWhatsAppProvider();

  const { userId, customerProfileId } = await resolveCustomerIdentity(phone);

  const conversation: { id: string; state: ConversationState; context: unknown } = await prisma.conversation.upsert({
    where: { customerPhone: phone },
    update: {},
    create: { customerPhone: phone, userId, state: "START", context: {} },
  });

  const handler = STATE_HANDLERS[conversation.state];
  const context = (conversation.context as ConversationContext) ?? {};

  try {
    const result = await handler({
      customerUserId: userId,
      customerProfileId,
      phone,
      state: conversation.state,
      context,
      inbound,
      whatsapp,
    });

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { state: result.nextState, context: result.context as object, userId },
    });
  } catch (err) {
    logger.error({ err, phone, state: conversation.state }, "Conversation handler failed");
    await whatsapp.sendMessage(phone, "Sorry, something went wrong on our end. Please try again in a moment.");
  }
}

async function resolveCustomerIdentity(phone: string): Promise<{ userId: string; customerProfileId: string }> {
  const user = await prisma.user.upsert({
    where: { phone },
    update: {},
    create: { phone, role: Role.CUSTOMER },
  });

  const customerProfile = await prisma.customerProfile.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id, fullName: "WhatsApp Customer" },
  });

  return { userId: user.id, customerProfileId: customerProfile.id };
}
