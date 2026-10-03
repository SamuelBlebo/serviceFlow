import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithAuth, signedIn, signedOut } from "../../test/auth";
import { RequireAuth, RequireCapability, safeNextPath } from "./guards";

const Protected = () => <p>Secret area</p>;

describe("RequireAuth", () => {
  it("shows a spinner while the session is loading", () => {
    renderWithAuth(
      <RequireAuth>
        <Protected />
      </RequireAuth>,
      { session: { status: "loading" }, path: "/app" },
    );
    expect(screen.getByLabelText("Loading")).toBeInTheDocument();
    expect(screen.queryByText("Secret area")).not.toBeInTheDocument();
  });

  it("redirects signed-out visitors to login, remembering where they were going", () => {
    renderWithAuth(
      <RequireAuth>
        <Protected />
      </RequireAuth>,
      { session: signedOut, path: "/app/bookings" },
    );
    expect(screen.getByTestId("location")).toHaveTextContent("/login?next=%2Fapp%2Fbookings");
  });

  it("uses the admin login page for the admin area", () => {
    renderWithAuth(
      <RequireAuth loginPath="/admin/login">
        <Protected />
      </RequireAuth>,
      { session: signedOut, path: "/admin" },
    );
    expect(screen.getByTestId("location")).toHaveTextContent("/admin/login?next=%2Fadmin");
  });

  it("renders the area for a signed-in user", () => {
    renderWithAuth(
      <RequireAuth>
        <Protected />
      </RequireAuth>,
      { session: signedIn(), path: "/app" },
    );
    expect(screen.getByText("Secret area")).toBeInTheDocument();
  });
});

describe("RequireCapability", () => {
  it("blocks a customer from the admin area", () => {
    renderWithAuth(
      <RequireCapability capability="admin">
        <Protected />
      </RequireCapability>,
      { session: signedIn(), path: "/admin" },
    );
    expect(screen.getByRole("alert")).toHaveTextContent("You don't have access to this area");
    expect(screen.queryByText("Secret area")).not.toBeInTheDocument();
  });

  it("lets a user with the capability through", () => {
    renderWithAuth(
      <RequireCapability capability="tech">
        <Protected />
      </RequireCapability>,
      { session: signedIn({ tech: true }), path: "/tech" },
    );
    expect(screen.getByText("Secret area")).toBeInTheDocument();
  });
});

describe("safeNextPath", () => {
  it("allows only same-site relative paths (no open redirects)", () => {
    expect(safeNextPath("/app/bookings", "/app")).toBe("/app/bookings");
    expect(safeNextPath("//evil.example", "/app")).toBe("/app");
    expect(safeNextPath("https://evil.example", "/app")).toBe("/app");
    expect(safeNextPath(null, "/app")).toBe("/app");
  });
});
