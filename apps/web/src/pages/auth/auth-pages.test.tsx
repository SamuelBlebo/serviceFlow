import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeActions, renderWithAuth, signedIn } from "../../test/auth";
import { AdminLoginPage } from "./AdminLoginPage";
import { PhoneLoginPage } from "./PhoneLoginPage";
import { VerifyCodePage } from "./VerifyCodePage";

import type { call as realCall } from "../../lib/firebase/functions";

// Each test gets its own mock. (A shared module-level vi.fn reconfigured with
// mockImplementation to reject made vitest 5 fail the test even though the
// page caught the error — a test-double quirk, not product behaviour.)
let call = vi.fn();
let callFn = call as unknown as typeof realCall;
function stubCall(impl: (...args: unknown[]) => Promise<unknown>) {
  call = vi.fn(impl);
  callFn = call as unknown as typeof realCall;
}

beforeEach(() => stubCall(async () => undefined));

/** Firebase errors are Error instances carrying a `code` — mirror that in test doubles. */
function firebaseError(code: string, message = code): Error {
  return Object.assign(new Error(message), { code });
}

describe("PhoneLoginPage", () => {
  it("rejects a non-Ghanaian number without calling the server", async () => {
    renderWithAuth(<PhoneLoginPage callFn={callFn} />, { path: "/login" });
    await userEvent.type(screen.getByLabelText("Phone number"), "+1 415 555 2671");
    await userEvent.click(screen.getByRole("button", { name: "Send code" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a valid Ghanaian phone number");
    expect(call).not.toHaveBeenCalled();
  });

  it("requests a code and moves to the verify step", async () => {
    stubCall(async () => ({ ok: true, phone: "+233241234567", expiresInSeconds: 300, resendInSeconds: 30 }));
    renderWithAuth(<PhoneLoginPage callFn={callFn} />, { path: "/login" });
    await userEvent.type(screen.getByLabelText("Phone number"), "024 123 4567");
    await userEvent.click(screen.getByRole("button", { name: "Send code" }));
    expect(call).toHaveBeenCalledWith("requestOtp", { phone: "024 123 4567" });
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/login/verify"));
  });

  it("shows the server's message when the request is refused", async () => {
    stubCall(async () => {
      throw firebaseError("functions/resource-exhausted", "Please wait 20 seconds before requesting another code.");
    });
    renderWithAuth(<PhoneLoginPage callFn={callFn} />, { path: "/login" });
    await userEvent.type(screen.getByLabelText("Phone number"), "0241234567");
    await userEvent.click(screen.getByRole("button", { name: "Send code" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Please wait 20 seconds");
  });

  it("sends an already signed-in user straight on", () => {
    renderWithAuth(<PhoneLoginPage callFn={callFn} />, { path: "/login", session: signedIn() });
    expect(screen.getByTestId("location")).toHaveTextContent("/app");
  });
});

describe("VerifyCodePage", () => {
  const state = { phone: "+233241234567", resendInSeconds: 30, next: "/app/bookings", devCode: "482913" };
  const entry = { pathname: "/login/verify", state };

  it("returns to step 1 if opened directly", () => {
    renderWithAuth(<VerifyCodePage callFn={callFn} />, { path: "/login/verify" });
    expect(screen.getByTestId("location")).toHaveTextContent("/login");
  });

  it("shows the number in local format and the emulator dev code", () => {
    renderWithAuth(<VerifyCodePage callFn={callFn} />, { path: "/login/verify", initialEntry: entry });
    expect(screen.getByText("024 123 4567")).toBeInTheDocument();
    expect(screen.getByTestId("dev-code")).toHaveTextContent("482913");
    expect(screen.getByText(/request a new code in 30s/)).toBeInTheDocument();
  });

  it("verifies the code, signs in with the returned token and continues to the original page", async () => {
    stubCall(async () => ({ token: "custom-token", isNewUser: false }));
    const actions = fakeActions();
    renderWithAuth(<VerifyCodePage callFn={callFn} />, { path: "/login/verify", initialEntry: entry, actions });
    await userEvent.type(screen.getByLabelText("6-digit code"), "482913");
    await userEvent.click(screen.getByRole("button", { name: "Verify and sign in" }));
    expect(call).toHaveBeenCalledWith("verifyOtp", { phone: "+233241234567", code: "482913" });
    await waitFor(() => expect(actions.signInWithToken).toHaveBeenCalledWith("custom-token"));
    expect(await screen.findByTestId("location")).toHaveTextContent("/app/bookings");
  });

  it("keeps only digits and shows the server error for a wrong code", async () => {
    stubCall(async () => {
      throw firebaseError("functions/invalid-argument", "Incorrect code. 4 attempts left.");
    });
    renderWithAuth(<VerifyCodePage callFn={callFn} />, { path: "/login/verify", initialEntry: entry });
    const input = screen.getByLabelText("6-digit code");
    await userEvent.type(input, "12a34-56");
    expect(input).toHaveValue("123456");
    await userEvent.click(screen.getByRole("button", { name: "Verify and sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Incorrect code. 4 attempts left.");
  });
});

describe("AdminLoginPage", () => {
  it("signs a non-admin straight back out with an explanation", async () => {
    const actions = fakeActions({ signInAdmin: vi.fn(async () => ({ tech: false, admin: false })) });
    renderWithAuth(<AdminLoginPage />, { path: "/admin/login", actions });
    await userEvent.type(screen.getByLabelText("Email"), "someone@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "a-long-password");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("isn't a ServiceFlow administrator");
    expect(actions.signOut).toHaveBeenCalled();
  });

  it("takes an admin to the admin area", async () => {
    const actions = fakeActions();
    renderWithAuth(<AdminLoginPage />, { path: "/admin/login", actions });
    await userEvent.type(screen.getByLabelText("Email"), "admin@serviceflow.dev");
    await userEvent.type(screen.getByLabelText("Password"), "a-long-password");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(actions.signInAdmin).toHaveBeenCalledWith("admin@serviceflow.dev", "a-long-password");
    expect(await screen.findByTestId("location")).toHaveTextContent("/admin");
  });

  it("maps wrong credentials to a plain message", async () => {
    const actions = fakeActions({ signInAdmin: vi.fn(async () => Promise.reject(firebaseError("auth/invalid-credential"))) });
    renderWithAuth(<AdminLoginPage />, { path: "/admin/login", actions });
    await userEvent.type(screen.getByLabelText("Email"), "admin@serviceflow.dev");
    await userEvent.type(screen.getByLabelText("Password"), "wrong-password");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Incorrect email or password.");
  });
});
