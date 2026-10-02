import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AddressForm } from "../../features/profile/AddressForm";
import { RequireCustomerProfile } from "../../lib/profile/CustomerProfileProvider";
import { fakeActions } from "../../test/auth";
import { AREAS, address, customer, fakeStore, readyState, renderWithProfile } from "../../test/profile";
import { CustomerHome } from "./CustomerHome";
import { ProfilePage } from "./ProfilePage";
import { WelcomePage } from "./WelcomePage";

describe("AddressForm", () => {
  it("requires an area and directions a technician can follow", async () => {
    const onSubmit = vi.fn();
    render(<AddressForm areas={AREAS} onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole("button", { name: "Save address" }));
    expect(screen.getByText("Choose the area")).toBeInTheDocument();
    expect(screen.getByText(/Describe how to find you/)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("rejects a malformed GhanaPost GPS address", async () => {
    const onSubmit = vi.fn();
    render(<AddressForm areas={AREAS} onSubmit={onSubmit} />);
    await userEvent.selectOptions(screen.getByLabelText("Area"), "osu");
    await userEvent.type(screen.getByLabelText("Directions"), "Behind the Osu Castle, yellow gate");
    await userEvent.type(screen.getByLabelText("GhanaPost GPS (optional)"), "GA-12");
    await userEvent.click(screen.getByRole("button", { name: "Save address" }));
    expect(screen.getByText(/GA-543-0125/)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits normalized values with the chosen area", async () => {
    const onSubmit = vi.fn();
    render(<AddressForm areas={AREAS} onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole("button", { name: "Work" }));
    await userEvent.selectOptions(screen.getByLabelText("Area"), "osu");
    await userEvent.type(screen.getByLabelText("Directions"), "  Behind the Osu Castle, yellow gate ");
    await userEvent.type(screen.getByLabelText("GhanaPost GPS (optional)"), "ga5430125");
    await userEvent.click(screen.getByRole("button", { name: "Save address" }));
    expect(onSubmit).toHaveBeenCalledWith(
      { label: "Work", areaId: "osu", directions: "Behind the Osu Castle, yellow gate", ghanaPostGps: "GA-543-0125", notes: null },
      AREAS[1],
    );
  });
});

describe("RequireCustomerProfile", () => {
  it("sends a user without a profile to the welcome step", () => {
    renderWithProfile(
      <RequireCustomerProfile>
        <p>Area</p>
      </RequireCustomerProfile>,
      { state: readyState({ customer: null, addresses: [] }) },
    );
    expect(screen.getByTestId("location")).toHaveTextContent("/app/welcome");
  });

  it("remembers the requested page when redirecting to the welcome step", () => {
    renderWithProfile(
      <RequireCustomerProfile>
        <p>Area</p>
      </RequireCustomerProfile>,
      { state: readyState({ customer: null, addresses: [] }), path: "/app/bookings" },
    );
    expect(screen.getByTestId("location")).toHaveTextContent("/app/welcome");
  });

  it("shows the area once the profile exists", () => {
    renderWithProfile(
      <RequireCustomerProfile>
        <p>Area</p>
      </RequireCustomerProfile>,
    );
    expect(screen.getByText("Area")).toBeInTheDocument();
  });
});

describe("WelcomePage", () => {
  const noProfile = readyState({ customer: null, addresses: [] });

  it("validates the name before moving on", async () => {
    renderWithProfile(<WelcomePage />, { state: noProfile, path: "/app/welcome" });
    await userEvent.type(screen.getByLabelText("Full name"), "Agent 007");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/letters only/);
  });

  it("creates the profile with a first address, then opens the dashboard", async () => {
    const store = fakeStore();
    renderWithProfile(<WelcomePage />, { state: noProfile, store, path: "/app/welcome" });
    await userEvent.type(screen.getByLabelText("Full name"), "  Ama   Serwaa ");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    await userEvent.selectOptions(screen.getByLabelText("Area"), "east-legon");
    await userEvent.type(screen.getByLabelText("Directions"), "Behind A&C Mall, cream house");
    await userEvent.click(screen.getByRole("button", { name: "Save and continue" }));
    await waitFor(() =>
      expect(store.createCustomerProfile).toHaveBeenCalledWith(
        "u1",
        "Ama Serwaa",
        expect.objectContaining({ area: AREAS[0], values: expect.objectContaining({ label: "Home", directions: "Behind A&C Mall, cream house" }) }),
      ),
    );
    expect(await screen.findByTestId("location")).toHaveTextContent("/app");
  });

  it("lets the customer skip the address", async () => {
    const store = fakeStore();
    renderWithProfile(<WelcomePage />, { state: noProfile, store, path: "/app/welcome" });
    await userEvent.type(screen.getByLabelText("Full name"), "Kofi Boateng");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    await userEvent.click(screen.getByRole("button", { name: "Skip for now" }));
    await waitFor(() => expect(store.createCustomerProfile).toHaveBeenCalledWith("u1", "Kofi Boateng", null));
  });

  it("shows a save failure instead of pretending it worked", async () => {
    const store = fakeStore({
      createCustomerProfile: vi.fn(async () => {
        throw Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" });
      }),
    });
    renderWithProfile(<WelcomePage />, { state: noProfile, store, path: "/app/welcome" });
    await userEvent.type(screen.getByLabelText("Full name"), "Kofi Boateng");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    await userEvent.click(screen.getByRole("button", { name: "Skip for now" }));
    expect(await screen.findByText("Something went wrong. Please try again.")).toBeInTheDocument();
    expect(screen.queryByTestId("location")).not.toBeInTheDocument();
  });

  it("returns to the page the customer was trying to open", async () => {
    const store = fakeStore();
    renderWithProfile(<WelcomePage />, { state: noProfile, store, path: "/app/welcome", routerState: { from: "/app/bookings" } });
    await userEvent.type(screen.getByLabelText("Full name"), "Kofi Boateng");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    await userEvent.click(screen.getByRole("button", { name: "Skip for now" }));
    expect(await screen.findByTestId("location")).toHaveTextContent("/app/bookings");
  });

  it("ignores destinations outside the customer area", async () => {
    renderWithProfile(<WelcomePage />, { state: noProfile, path: "/app/welcome", routerState: { from: "//evil.example" } });
    await userEvent.type(screen.getByLabelText("Full name"), "Kofi Boateng");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    await userEvent.click(screen.getByRole("button", { name: "Skip for now" }));
    expect(await screen.findByTestId("location")).toHaveTextContent(/^\/app$/);
  });

  it("lets someone who signed in with the wrong number sign out", async () => {
    const actions = fakeActions();
    renderWithProfile(<WelcomePage />, { state: noProfile, path: "/app/welcome", actions });
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(actions.signOut).toHaveBeenCalled());
    expect(screen.getByTestId("location")).toHaveTextContent(/^\/$/);
  });

  it("skips the welcome step for someone who already has a profile", () => {
    renderWithProfile(<WelcomePage />, { path: "/app/welcome" });
    expect(screen.getByTestId("location")).toHaveTextContent("/app");
  });
});

describe("ProfilePage", () => {
  const twoAddresses = readyState({
    customer: customer({ defaultAddressId: "work" }),
    addresses: [address("home"), address("work", { label: "Work", areaId: "osu", areaName: "Osu", ghanaPostGps: "GA-543-0125" })],
  });

  it("lists the default address first, with a badge and its digital address", () => {
    renderWithProfile(<ProfilePage />, { state: twoAddresses, path: "/app/profile" });
    const items = screen.getAllByTestId(/^address-/);
    expect(items[0]).toHaveAttribute("data-testid", "address-work");
    expect(within(items[0] as HTMLElement).getByText("Default")).toBeInTheDocument();
    expect(within(items[0] as HTMLElement).getByText("GA-543-0125")).toBeInTheDocument();
  });

  it("renames the customer", async () => {
    const store = fakeStore();
    renderWithProfile(<ProfilePage />, { store, path: "/app/profile" });
    const field = screen.getByLabelText("Full name");
    await userEvent.clear(field);
    await userEvent.type(field, "Ama Serwaa Boateng");
    await userEvent.click(screen.getByRole("button", { name: "Save name" }));
    await waitFor(() => expect(store.updateCustomerName).toHaveBeenCalledWith("u1", "Ama Serwaa Boateng"));
    expect(await screen.findByRole("status")).toHaveTextContent("Saved");
  });

  it("asks before deleting and passes the profile so the default can move", async () => {
    const store = fakeStore();
    renderWithProfile(<ProfilePage />, { state: twoAddresses, store, path: "/app/profile" });
    const work = screen.getByTestId("address-work");
    await userEvent.click(within(work).getByRole("button", { name: "Delete" }));
    expect(store.deleteAddress).not.toHaveBeenCalled();
    await userEvent.click(within(work).getByRole("button", { name: "Yes, delete" }));
    await waitFor(() => expect(store.deleteAddress).toHaveBeenCalledWith("u1", "work", expect.objectContaining({ defaultAddressId: "work" }), expect.any(Array)));
  });

  it("makes another address the default", async () => {
    const store = fakeStore();
    renderWithProfile(<ProfilePage />, { state: twoAddresses, store, path: "/app/profile" });
    await userEvent.click(within(screen.getByTestId("address-home")).getByRole("button", { name: "Make default" }));
    await waitFor(() => expect(store.setDefaultAddress).toHaveBeenCalledWith("u1", "home"));
  });

  it("makes the first saved address the default automatically", async () => {
    const store = fakeStore();
    renderWithProfile(<ProfilePage />, { state: readyState({ customer: customer({ defaultAddressId: null }), addresses: [] }), store, path: "/app/profile" });
    await userEvent.click(screen.getByRole("button", { name: "Add address" }));
    await userEvent.selectOptions(screen.getByLabelText("Area"), "osu");
    await userEvent.type(screen.getByLabelText("Directions"), "Behind the Osu Castle, yellow gate");
    await userEvent.click(screen.getByRole("button", { name: "Save address" }));
    await waitFor(() => expect(store.saveAddress).toHaveBeenCalledWith("u1", expect.anything(), AREAS[1], { makeDefault: true }));
  });

  it("stops adding at the saved-address limit", () => {
    const ten = Array.from({ length: 10 }, (_, i) => address(`a${i}`));
    renderWithProfile(<ProfilePage />, { state: readyState({ addresses: ten, customer: customer({ defaultAddressId: "a0" }) }), path: "/app/profile" });
    expect(screen.getByRole("button", { name: "Add address" })).toBeDisabled();
    expect(screen.getByText(/up to 10 addresses/)).toBeInTheDocument();
  });
});

describe("CustomerHome", () => {
  it("greets the customer by first name and shows the default address", () => {
    renderWithProfile(<CustomerHome watchMine={(_uid, onData) => (onData([]), () => undefined)} />);
    expect(screen.getByRole("heading", { name: "Welcome, Ama" })).toBeInTheDocument();
    expect(screen.getByText(/East Legon, Opposite the Shell station/)).toBeInTheDocument();
  });
});
