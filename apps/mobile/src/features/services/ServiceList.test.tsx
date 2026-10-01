import { render, screen } from "@testing-library/react-native";
import { ServiceList } from "./ServiceList";

const plumbing = {
  id: "plumbing",
  name: "Plumbing",
  slug: "plumbing",
  description: "Leak repairs and pipe installation.",
  iconPath: null,
  priceRange: { minMinor: 10000, maxMinor: 40000 },
  isActive: true,
  sortOrder: 1,
};

describe("ServiceList (mobile)", () => {
  it("shows a loading indicator", () => {
    render(<ServiceList state={{ status: "loading" }} />);
    expect(screen.getByLabelText("Loading services")).toBeTruthy();
  });

  it("renders services with GHS price ranges", () => {
    render(<ServiceList state={{ status: "ready", services: [plumbing] }} />);
    expect(screen.getByText("Plumbing")).toBeTruthy();
    expect(screen.getByText("GH₵100.00 – GH₵400.00")).toBeTruthy();
  });

  it("tells the technician when data comes from the offline cache", () => {
    render(<ServiceList state={{ status: "ready", services: [plumbing], fromCache: true }} />);
    expect(screen.getByText("Showing saved data")).toBeTruthy();
  });

  it("renders explicit empty and error states", () => {
    const { rerender } = render(<ServiceList state={{ status: "ready", services: [] }} />);
    expect(screen.getByText("No services yet")).toBeTruthy();
    rerender(<ServiceList state={{ status: "error", message: "Couldn't load services." }} />);
    expect(screen.getByRole("alert")).toBeTruthy();
  });
});
