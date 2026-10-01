import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { fakeActions, renderWithAuth, signedIn } from "../../test/auth";
import { AreaLayout } from "./AreaLayout";

const NAV = [{ to: "/app", label: "Dashboard" }];

describe("AreaLayout", () => {
  it("shows who is signed in, in local phone format", () => {
    renderWithAuth(<AreaLayout areaName="Customer" nav={NAV} />, { session: signedIn(), path: "/app" });
    expect(screen.getByText("024 123 4567")).toBeInTheDocument();
  });

  it("leaves the protected area BEFORE ending the session, landing on the home page", async () => {
    const actions = fakeActions();
    renderWithAuth(<AreaLayout areaName="Customer" nav={NAV} />, { session: signedIn(), path: "/app", actions });
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(actions.signOut).toHaveBeenCalled());
    expect(screen.getByTestId("location")).toHaveTextContent(/^\/$/);
  });
});
