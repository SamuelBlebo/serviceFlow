import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { VerificationForm } from "../../features/technician/VerificationForm";
import { WorkSettingsForm } from "../../features/technician/WorkSettingsForm";
import { fakeActions, renderWithAuth, signedIn } from "../../test/auth";
import {
  AREAS,
  SERVICES,
  fakeTechnicianStore,
  readyTechnician,
  renderWithTechnician,
  technician,
  verification,
  withWork,
} from "../../test/technician";
import { AdminTechniciansPage, AdminVerificationPage } from "../admin/AdminTechnicianPages";
import { TechDashboard } from "./TechDashboard";
import { TechRegisterPage } from "./TechRegisterPage";
import { TechVerificationPage } from "./TechVerificationPage";

const photo = (name: string, type = "image/jpeg") => new File([new Uint8Array(100)], name, { type });

describe("WorkSettingsForm", () => {
  const initial = { serviceIds: [], areaIds: [], weeklyAvailability: [{ day: 1, start: "08:00", end: "17:00" }] };

  it("requires at least one service and one area", async () => {
    const onSubmit = vi.fn();
    render(<WorkSettingsForm services={SERVICES} areas={AREAS} initial={initial} onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Choose at least one service");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits services, areas and the working days", async () => {
    const onSubmit = vi.fn();
    render(<WorkSettingsForm services={SERVICES} areas={AREAS} initial={initial} onSubmit={onSubmit} />);
    await userEvent.click(screen.getByLabelText("Plumbing"));
    await userEvent.click(screen.getByLabelText("Osu"));
    await userEvent.click(screen.getByLabelText("Saturday"));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSubmit).toHaveBeenCalledWith({
      serviceIds: ["plumbing"],
      areaIds: ["osu"],
      weeklyAvailability: [
        { day: 1, start: "08:00", end: "17:00" },
        { day: 6, start: "08:00", end: "17:00" },
      ],
    });
  });

  it("refuses a working period that ends before it starts", async () => {
    const onSubmit = vi.fn();
    render(<WorkSettingsForm services={SERVICES} areas={AREAS} initial={{ ...initial, serviceIds: ["plumbing"], areaIds: ["osu"] }} onSubmit={onSubmit} />);
    const start = screen.getByLabelText("Monday start");
    await userEvent.clear(start);
    await userEvent.type(start, "18:00");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/before end time/);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe("VerificationForm", () => {
  it("validates the Ghana Card number and requires both photos", async () => {
    const onSubmit = vi.fn();
    render(<VerificationForm onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText("ID number"), "GHA-123");
    await userEvent.click(screen.getByRole("button", { name: "Submit for review" }));
    expect(screen.getByText(/GHA-123456789-0/, { selector: "[role=alert]" })).toBeInTheDocument();
    expect(screen.getByText("Add a photo of your ID")).toBeInTheDocument();
    expect(screen.getByText("Add a selfie")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits the normalized number with both photos", async () => {
    const onSubmit = vi.fn();
    render(<VerificationForm onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText("ID number"), "gha 1234567890");
    await userEvent.upload(screen.getByLabelText("Photo of your ID"), photo("id.jpg"));
    await userEvent.upload(screen.getByLabelText("Selfie"), photo("me.jpg"));
    await userEvent.click(screen.getByRole("button", { name: "Submit for review" }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ idType: "GHANA_CARD", idNumber: "GHA-123456789-0" }));
  });
});

describe("TechRegisterPage", () => {
  it("registers, refreshes the session for the new claim, then opens the provider area", async () => {
    const store = { register: vi.fn(async () => ({ ok: true as const, id: "u1" })) };
    const actions = fakeActions();
    renderWithAuth(<TechRegisterPage store={store} />, { session: signedIn(), actions, path: "/tech/register" });
    await userEvent.type(screen.getByLabelText("Name customers will see"), "Kwame Owusu");
    await userEvent.clear(screen.getByLabelText("Years of experience"));
    await userEvent.type(screen.getByLabelText("Years of experience"), "7");
    await userEvent.click(screen.getByRole("button", { name: "Register as a provider" }));
    await waitFor(() => expect(store.register).toHaveBeenCalledWith(expect.objectContaining({ displayName: "Kwame Owusu", yearsExperience: 7 })));
    await waitFor(() => expect(actions.refreshSession).toHaveBeenCalled());
    expect(await screen.findByTestId("location")).toHaveTextContent("/tech");
  });

  it("sends existing providers straight to their dashboard", () => {
    renderWithAuth(<TechRegisterPage store={{ register: vi.fn() }} />, { session: signedIn({ tech: true }), path: "/tech/register" });
    expect(screen.getByTestId("location")).toHaveTextContent("/tech");
  });
});

describe("TechDashboard", () => {
  it("guides a new provider through the remaining steps", () => {
    renderWithTechnician(<TechDashboard />);
    expect(screen.getByTestId("status-card")).toHaveTextContent("Finish your registration");
    expect(screen.getByRole("link", { name: "Start" })).toHaveAttribute("href", "/tech/availability");
    expect(screen.queryByRole("button", { name: "Go online" })).not.toBeInTheDocument();
  });

  it("lets a verified provider go online", async () => {
    const { store } = renderWithTechnician(<TechDashboard />, { state: readyTechnician(technician({ ...withWork, verificationStatus: "VERIFIED" })) });
    await userEvent.click(screen.getByRole("button", { name: "Go online" }));
    await waitFor(() => expect(store.setOnline).toHaveBeenCalledWith("u1", true));
  });

  it("never offers the online switch to pending or suspended providers", () => {
    for (const verificationStatus of ["PENDING", "SUSPENDED"] as const) {
      const { unmount } = renderWithTechnician(<TechDashboard />, { state: readyTechnician(technician({ ...withWork, verificationStatus })) });
      expect(screen.queryByRole("button", { name: /Go online/ })).not.toBeInTheDocument();
      unmount();
    }
  });
});

describe("TechVerificationPage", () => {
  it("asks for services and areas first", () => {
    renderWithTechnician(<TechVerificationPage />, { path: "/tech/verification" });
    expect(screen.getByRole("link", { name: /choose your services/ })).toHaveAttribute("href", "/tech/availability");
  });

  it("shows the rejection reason and lets the provider resubmit", () => {
    renderWithTechnician(<TechVerificationPage />, {
      path: "/tech/verification",
      state: readyTechnician(technician({ ...withWork, verificationStatus: "REJECTED" }), [verification({ status: "REJECTED", reviewNotes: "ID photo is blurry" })]),
    });
    expect(screen.getByText("Reason: ID photo is blurry")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit for review" })).toBeInTheDocument();
  });

  it("hides the form while a submission is pending", () => {
    renderWithTechnician(<TechVerificationPage />, {
      path: "/tech/verification",
      state: readyTechnician(technician({ ...withWork, verificationStatus: "PENDING" }), [verification()]),
    });
    expect(screen.getByRole("status")).toHaveTextContent("being reviewed");
    expect(screen.queryByRole("button", { name: "Submit for review" })).not.toBeInTheDocument();
  });

  it("retries a failed submission with the same submission and request ids", async () => {
    let calls = 0;
    const submitVerification = vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw Object.assign(new Error("offline"), { code: "functions/unavailable" });
      return { ok: true as const, id: "x" };
    });
    renderWithTechnician(<TechVerificationPage />, {
      path: "/tech/verification",
      state: readyTechnician(technician(withWork)),
      store: fakeTechnicianStore({ submitVerification }),
    });
    await userEvent.type(screen.getByLabelText("ID number"), "GHA-123456789-0");
    await userEvent.upload(screen.getByLabelText("Photo of your ID"), photo("id.jpg"));
    await userEvent.upload(screen.getByLabelText("Selfie"), photo("me.jpg"));
    await userEvent.click(screen.getByRole("button", { name: "Submit for review" }));
    expect(await screen.findByText(/couldn't reach ServiceFlow/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Submit for review" }));
    await waitFor(() => expect(submitVerification).toHaveBeenCalledTimes(2));
    const [first, second] = submitVerification.mock.calls.map((c) => (c as unknown as [string, { submissionId: string; requestId: string }])[1]);
    expect(first?.submissionId).toBe(second?.submissionId);
    expect(first?.requestId).toBe(second?.requestId);
  });
});

describe("Admin technician pages", () => {
  const pending = technician({ ...withWork, verificationStatus: "PENDING", latestVerificationId: "u1_sub1" });
  const watchTechnicians = (list: ReturnType<typeof technician>[]) => (_s: unknown, onData: (t: ReturnType<typeof technician>[]) => void) => {
    onData(list);
    return () => undefined;
  };
  const watchSubmission = (_id: string, onData: (v: ReturnType<typeof verification>) => void) => {
    onData(verification());
    return () => undefined;
  };
  const loadUrl = async (path: string) => `https://example.test/${path}`;
  const renderAdmin = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

  it("shows the submission with its ID number and both private photos, and approves it", async () => {
    const store = { review: vi.fn(async () => ({ ok: true as const, id: "u1" })) };
    renderAdmin(<AdminVerificationPage store={store} watchTechnicians={watchTechnicians([pending])} watchSubmission={watchSubmission} loadUrl={loadUrl} />);
    const card = screen.getByTestId("pending-u1");
    expect(within(card).getByText("GHA-123456789-0")).toBeInTheDocument();
    expect(await within(card).findByAltText("ID photo")).toHaveAttribute("src", "https://example.test/verifications/u1/sub1/id.jpg");
    await userEvent.click(within(card).getByRole("button", { name: "Approve" }));
    await userEvent.click(within(card).getByRole("button", { name: "Approve and verify" }));
    await waitFor(() => expect(store.review).toHaveBeenCalledWith(expect.objectContaining({ technicianId: "u1", decision: "APPROVE" })));
  });

  it("requires a reason to reject", async () => {
    const store = { review: vi.fn(async () => ({ ok: true as const, id: "u1" })) };
    renderAdmin(<AdminVerificationPage store={store} watchTechnicians={watchTechnicians([pending])} watchSubmission={watchSubmission} loadUrl={loadUrl} />);
    await userEvent.click(screen.getByRole("button", { name: "Reject" }));
    await userEvent.click(screen.getByRole("button", { name: "Reject submission" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Explain the reason");
    expect(store.review).not.toHaveBeenCalled();
    await userEvent.type(screen.getByLabelText(/Reason/), "ID photo is blurry");
    await userEvent.click(screen.getByRole("button", { name: "Reject submission" }));
    await waitFor(() => expect(store.review).toHaveBeenCalledWith(expect.objectContaining({ decision: "REJECT", notes: "ID photo is blurry" })));
  });

  it("asks the admin to sign in again when the server requires a recent sign-in", async () => {
    const store = {
      review: vi.fn(async () => {
        throw Object.assign(new Error("Please sign in again"), { code: "functions/unauthenticated", details: { code: "REAUTH_REQUIRED" } });
      }),
    };
    renderAdmin(<AdminVerificationPage store={store} watchTechnicians={watchTechnicians([pending])} watchSubmission={watchSubmission} loadUrl={loadUrl} />);
    await userEvent.click(screen.getByRole("button", { name: "Approve" }));
    await userEvent.click(screen.getByRole("button", { name: "Approve and verify" }));
    expect(await screen.findByRole("link", { name: "Sign in again" })).toHaveAttribute("href", "/admin/login?reason=reauth");
  });

  it("lists technicians by status and suspends a verified one with a reason", async () => {
    const store = { review: vi.fn(async () => ({ ok: true as const, id: "v1" })) };
    const list = [technician({ id: "v1", displayName: "Ama Verified", verificationStatus: "VERIFIED", ...withWork }), technician({ id: "p1", displayName: "Yaw Pending", verificationStatus: "PENDING" })];
    renderAdmin(<AdminTechniciansPage store={store} watchTechnicians={watchTechnicians(list)} />);
    await userEvent.click(screen.getByRole("button", { name: "Verified" }));
    expect(screen.queryByText("Yaw Pending")).not.toBeInTheDocument();
    const row = screen.getByTestId("technician-v1");
    await userEvent.click(within(row).getByRole("button", { name: "Suspend" }));
    await userEvent.type(within(row).getByLabelText(/Reason/), "Customer safety complaint");
    await userEvent.click(within(row).getByRole("button", { name: "Suspend provider" }));
    await waitFor(() => expect(store.review).toHaveBeenCalledWith(expect.objectContaining({ technicianId: "v1", decision: "SUSPEND" })));
  });
});
