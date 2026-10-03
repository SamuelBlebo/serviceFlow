import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { Firestore } from "firebase-admin/firestore";
import { createPaymentProvider } from "./payments/factory";
import { MOCK_SIGNATURE_HEADER, MockPaymentProvider, signMockWebhook } from "./payments/mock-payment-provider";
import { parseMetaWebhook } from "./whatsapp/meta-cloud-api-provider";
import { MockWhatsAppProvider } from "./whatsapp/mock-whatsapp-provider";
import { verifyMetaSignature } from "./whatsapp/signature";

describe("verifyMetaSignature", () => {
  const secret = "app-secret";
  const body = Buffer.from(JSON.stringify({ entry: [] }));
  const valid = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

  it("accepts the correct signature over the raw body", () => {
    expect(verifyMetaSignature(body, valid, secret)).toBe(true);
  });

  it("rejects a tampered body, a wrong secret, a missing header or a missing secret", () => {
    expect(verifyMetaSignature(Buffer.from("{}"), valid, secret)).toBe(false);
    expect(verifyMetaSignature(body, valid, "other")).toBe(false);
    expect(verifyMetaSignature(body, undefined, secret)).toBe(false);
    expect(verifyMetaSignature(body, valid, "")).toBe(false);
  });
});

describe("parseMetaWebhook", () => {
  it("normalizes text, location and interactive messages and keeps the message id", () => {
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  { id: "wamid.1", from: "233241234567", timestamp: "1790000000", type: "text", text: { body: "Hi" } },
                  { id: "wamid.2", from: "233241234567", type: "location", location: { latitude: 5.6, longitude: -0.18 } },
                  { id: "wamid.3", from: "233241234567", type: "interactive", interactive: { list_reply: { id: "2" } } },
                  { from: "233241234567", type: "text", text: { body: "no id, so dropped" } },
                ],
              },
            },
          ],
        },
      ],
    };
    const messages = parseMetaWebhook(payload);
    expect(messages.map((m) => m.messageId)).toEqual(["wamid.1", "wamid.2", "wamid.3"]);
    expect(messages[0]).toMatchObject({ from: "+233241234567", type: "text", text: "Hi" });
    expect(messages[1]?.location).toEqual({ lat: 5.6, lng: -0.18 });
    expect(messages[2]?.interactiveId).toBe("2");
  });

  it("ignores garbage payloads", () => {
    expect(parseMetaWebhook(null)).toEqual([]);
    expect(parseMetaWebhook({ entry: "nope" })).toEqual([]);
  });
});

describe("mock providers", () => {
  it("mock WhatsApp parses the simplified dev shape", () => {
    const [msg] = new MockWhatsAppProvider().receiveWebhook({ from: "+233241234567", type: "text", text: "Hi" });
    expect(msg).toMatchObject({ from: "+233241234567", type: "text", text: "Hi" });
    expect(msg?.messageId).toMatch(/^mock_/);
  });

  it("payment factory allows the mock only in the emulator and refuses unknown providers", () => {
    const db = {} as Firestore;
    expect(createPaymentProvider("mock", { db, emulator: true }).id).toBe("mock");
    expect(() => createPaymentProvider("mock", { db, emulator: false })).toThrow(/only runs in the local emulator/);
    expect(() => createPaymentProvider("paystack", { db, emulator: true })).toThrow(/not implemented/);
  });

  it("mock payment webhooks are accepted only with a valid signature over the exact body", () => {
    const provider = new MockPaymentProvider({} as Firestore, "secret");
    const body = JSON.stringify({ eventId: "evt_1", type: "charge.updated", reference: "mock_b1_1", status: "SUCCEEDED" });
    const signature = signMockWebhook("secret", body);
    expect(provider.parseWebhook(Buffer.from(body), { [MOCK_SIGNATURE_HEADER]: signature })).toEqual({
      eventId: "evt_1",
      type: "charge.updated",
      reference: "mock_b1_1",
      status: "SUCCEEDED",
    });
    expect(provider.parseWebhook(Buffer.from(body.replace("SUCCEEDED", "FAILED")), { [MOCK_SIGNATURE_HEADER]: signature })).toBeNull();
    expect(provider.parseWebhook(Buffer.from(body), { [MOCK_SIGNATURE_HEADER]: signMockWebhook("wrong", body) })).toBeNull();
    expect(provider.parseWebhook(Buffer.from(body), {})).toBeNull();
    expect(provider.parseWebhook(Buffer.from("not json"), { [MOCK_SIGNATURE_HEADER]: signMockWebhook("secret", "not json") })).toBeNull();
  });
});
