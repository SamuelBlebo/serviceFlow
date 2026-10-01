import { describe, expect, it } from "vitest";
import { readEnv } from "./env";

const valid = {
  VITE_FIREBASE_API_KEY: "demo-api-key",
  VITE_FIREBASE_AUTH_DOMAIN: "demo-serviceflow.firebaseapp.com",
  VITE_FIREBASE_PROJECT_ID: "demo-serviceflow",
  VITE_FIREBASE_STORAGE_BUCKET: "demo-serviceflow.appspot.com",
  VITE_FIREBASE_APP_ID: "1:0:web:0",
};

describe("readEnv", () => {
  it("parses a valid config and defaults emulators off", () => {
    const env = readEnv(valid);
    expect(env.VITE_USE_EMULATORS).toBe(false);
    expect(env.VITE_FIREBASE_FUNCTIONS_REGION).toBe("europe-west1");
  });

  it("turns VITE_USE_EMULATORS=true into a boolean", () => {
    expect(readEnv({ ...valid, VITE_USE_EMULATORS: "true" }).VITE_USE_EMULATORS).toBe(true);
  });

  it("fails loudly and names the missing keys", () => {
    expect(() => readEnv({})).toThrow(/VITE_FIREBASE_PROJECT_ID/);
  });
});
