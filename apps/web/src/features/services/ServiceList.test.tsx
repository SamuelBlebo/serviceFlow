import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
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

describe("ServiceList", () => {
  it("shows a busy skeleton while loading", () => {
    render(<ServiceList state={{ status: "loading" }} />);
    expect(screen.getByLabelText("Loading services")).toHaveAttribute("aria-busy", "true");
  });

  it("renders services with their GHS price range", () => {
    render(<ServiceList state={{ status: "ready", services: [plumbing] }} />);
    expect(screen.getByRole("heading", { name: "Plumbing" })).toBeInTheDocument();
    expect(screen.getByText("GH₵100.00 – GH₵400.00")).toBeInTheDocument();
  });

  it("explains an empty catalogue instead of rendering nothing", () => {
    render(<ServiceList state={{ status: "ready", services: [] }} />);
    expect(screen.getByText("No services are available yet.")).toBeInTheDocument();
  });

  it("shows an error with a working retry action", async () => {
    const onRetry = vi.fn();
    render(<ServiceList state={{ status: "error", message: "We couldn't load services right now." }} onRetry={onRetry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("We couldn't load services right now.");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
