import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { ServiceForm } from "../../features/catalogue/ServiceForm";
import { ServiceDetailView } from "../../features/services/LiveServiceDetail";
import type { CatalogueStore, Service } from "../../lib/admin/catalogue-store";
import { AdminServicesPage } from "./AdminServicesPage";

function service(id: string, overrides: Partial<Service> = {}): Service {
  return {
    id,
    name: id[0]?.toUpperCase() + id.slice(1),
    slug: id,
    description: "",
    iconPath: null,
    priceRange: { minMinor: 10000, maxMinor: 40000 },
    isActive: true,
    sortOrder: 1,
    ...overrides,
  };
}

function fakeStore(overrides: Partial<CatalogueStore> = {}): CatalogueStore {
  return {
    upsertService: vi.fn(async () => ({ ok: true as const, id: "x" })),
    setServiceActive: vi.fn(async () => ({ ok: true as const, id: "x" })),
    ...overrides,
  };
}

const watchWith = (services: Service[]) => (onData: (s: Service[]) => void) => {
  onData(services);
  return () => undefined;
};

describe("ServiceForm", () => {
  it("converts cedis to pesewas and previews the web address", async () => {
    const onSubmit = vi.fn();
    render(<ServiceForm onSubmit={onSubmit} onCancel={() => undefined} />);
    await userEvent.type(screen.getByLabelText("Service name"), "AC Installation & Repair");
    expect(screen.getByText("Web address: /services/ac-installation-and-repair")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Lowest typical price (GH₵)"), "150.50");
    await userEvent.type(screen.getByLabelText("Highest typical price (GH₵)"), "600");
    await userEvent.clear(screen.getByLabelText("Display order"));
    await userEvent.type(screen.getByLabelText("Display order"), "3");
    await userEvent.click(screen.getByRole("button", { name: "Create service" }));
    expect(onSubmit).toHaveBeenCalledWith({
      name: "AC Installation & Repair",
      description: "",
      priceRange: { minMinor: 15050, maxMinor: 60000 },
      sortOrder: 3,
    });
  });

  it("rejects non-numeric prices and an inverted range", async () => {
    const onSubmit = vi.fn();
    render(<ServiceForm onSubmit={onSubmit} onCancel={() => undefined} />);
    await userEvent.type(screen.getByLabelText("Service name"), "Carpentry");
    await userEvent.type(screen.getByLabelText("Lowest typical price (GH₵)"), "abc");
    await userEvent.type(screen.getByLabelText("Highest typical price (GH₵)"), "100");
    await userEvent.click(screen.getByRole("button", { name: "Create service" }));
    expect(screen.getByText(/amount in cedis/)).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText("Lowest typical price (GH₵)"));
    await userEvent.type(screen.getByLabelText("Lowest typical price (GH₵)"), "500");
    await userEvent.click(screen.getByRole("button", { name: "Create service" }));
    expect(screen.getByText(/lowest price can't be more than the highest/)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows the web address as fixed when editing", () => {
    render(
      <ServiceForm
        editing="plumbing"
        initial={{ name: "Plumbing", description: "", priceRange: { minMinor: 10000, maxMinor: 40000 }, sortOrder: 1 }}
        onSubmit={() => undefined}
        onCancel={() => undefined}
      />,
    );
    expect(screen.getByText("Web address: /services/plumbing (fixed)")).toBeInTheDocument();
    expect(screen.getByLabelText("Lowest typical price (GH₵)")).toHaveValue("100.00");
  });
});

describe("AdminServicesPage", () => {
  const services = [service("plumbing"), service("cleaning", { isActive: false, sortOrder: 9 })];

  it("lists visible and hidden services", () => {
    render(<AdminServicesPage store={fakeStore()} watch={watchWith(services)} />);
    expect(within(screen.getByTestId("service-plumbing")).getByText("Visible")).toBeInTheDocument();
    expect(within(screen.getByTestId("service-cleaning")).getByText("Hidden")).toBeInTheDocument();
  });

  it("creates a service, reusing the same request id when a failed save is retried", async () => {
    let attempt = 0;
    const upsertService = vi.fn(async () => {
      attempt += 1;
      if (attempt === 1) throw Object.assign(new Error("Network down"), { code: "functions/unavailable" });
      return { ok: true as const, id: "carpentry" };
    });
    render(<AdminServicesPage store={fakeStore({ upsertService })} watch={watchWith(services)} />);
    await userEvent.click(screen.getByRole("button", { name: "Add service" }));
    await userEvent.type(screen.getByLabelText("Service name"), "Carpentry");
    await userEvent.type(screen.getByLabelText("Lowest typical price (GH₵)"), "120");
    await userEvent.type(screen.getByLabelText("Highest typical price (GH₵)"), "500");
    await userEvent.click(screen.getByRole("button", { name: "Create service" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't reach ServiceFlow/);

    await userEvent.click(screen.getByRole("button", { name: "Create service" }));
    await waitFor(() => expect(upsertService).toHaveBeenCalledTimes(2));
    const [first, second] = upsertService.mock.calls.map((c) => (c as unknown as [{ requestId: string }])[0]);
    expect(first?.requestId).toBe(second?.requestId);
    expect(second).toMatchObject({ name: "Carpentry", priceRange: { minMinor: 12000, maxMinor: 50000 }, serviceId: undefined });
    await waitFor(() => expect(screen.queryByRole("button", { name: "Create service" })).not.toBeInTheDocument());
  });

  it("edits an existing service by its fixed id", async () => {
    const store = fakeStore();
    render(<AdminServicesPage store={store} watch={watchWith(services)} />);
    await userEvent.click(within(screen.getByTestId("service-plumbing")).getByRole("button", { name: "Edit" }));
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(store.upsertService).toHaveBeenCalledWith(expect.objectContaining({ serviceId: "plumbing", name: "Plumbing" })));
  });

  it("asks for confirmation before hiding, and records the reason", async () => {
    const store = fakeStore();
    render(<AdminServicesPage store={store} watch={watchWith(services)} />);
    const row = screen.getByTestId("service-plumbing");
    await userEvent.click(within(row).getByRole("button", { name: "Hide" }));
    expect(store.setServiceActive).not.toHaveBeenCalled();
    await userEvent.type(within(row).getByLabelText(/Reason/), "No verified plumbers this week");
    await userEvent.click(within(row).getByRole("button", { name: "Hide service" }));
    await waitFor(() =>
      expect(store.setServiceActive).toHaveBeenCalledWith(
        expect.objectContaining({ serviceId: "plumbing", isActive: false, reason: "No verified plumbers this week" }),
      ),
    );
  });

  it("offers to show a hidden service again", async () => {
    const store = fakeStore();
    render(<AdminServicesPage store={store} watch={watchWith(services)} />);
    const row = screen.getByTestId("service-cleaning");
    await userEvent.click(within(row).getByRole("button", { name: "Show" }));
    await userEvent.click(within(row).getByRole("button", { name: "Show service" }));
    await waitFor(() => expect(store.setServiceActive).toHaveBeenCalledWith(expect.objectContaining({ serviceId: "cleaning", isActive: true })));
  });
});

describe("ServiceDetailView (public)", () => {
  it("shows a hidden or unknown service as not available", () => {
    render(
      <MemoryRouter>
        <ServiceDetailView state={{ status: "ready", service: null }} />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "Service not available" })).toBeInTheDocument();
  });

  it("shows the service with its price range and a request link", () => {
    render(
      <MemoryRouter>
        <ServiceDetailView state={{ status: "ready", service: service("plumbing", { description: "Leaks and pipes." }) }} />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "Plumbing" })).toBeInTheDocument();
    expect(screen.getByText("GH₵100.00 – GH₵400.00")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Request plumbing" })).toHaveAttribute("href", "/app/request");
  });
});
