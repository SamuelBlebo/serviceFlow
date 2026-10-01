import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createPaymentProvider } from "./payments/factory";
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

  it("payment factory returns the mock and refuses unknown providers", async () => {
    const provider = createPaymentProvider("mock");
    const result = await provider.initiatePayment({
      paymentId: "b1",
      amountMinor: 20000,
      currency: "GHS",
      method: "MOBILE_MONEY",
      idempotencyKey: "b1:1",
    });
    expect(result.status).toBe("SUCCEEDED");
    await expect(provider.verifyPayment(result.reference)).resolves.toMatchObject({ amountMinor: 20000 });
    expect(() => createPaymentProvider("paystack")).toThrow(/not implemented/);
  });
});
