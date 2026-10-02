import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { VerificationStatus } from "@serviceflow/shared";
import { RegisterForm } from "./RegisterForm";
import { StatusCard } from "./StatusCard";
import { TechnicianHome } from "./TechnicianHome";
import type { Service, TechnicianState } from "./TechnicianProvider";
import type { ServiceArea, Technician } from "./technician-store";
import { VerificationForm } from "./VerificationForm";
import { WorkSettingsForm, normalizeTime } from "./WorkSettingsForm";

// RN Firebase is native; these components never touch it, but the store
// module's imports must still resolve under Jest.
jest.mock("./technician-store", () => ({}));
jest.mock("../lib/call", () => ({
  messageFromError: (e: unknown) => (e instanceof Error ? e.message : "Something went wrong. Please try again."),
}));

const ts = { toMillis: () => 0 };
const SERVICES = [
  { id: "plumbing", name: "Plumbing", slug: "plumbing", description: "", iconPath: null, priceRange: { minMinor: 1, maxMinor: 2 }, isActive: true, sortOrder: 1 },
  { id: "electrical", name: "Electrical", slug: "electrical", description: "", iconPath: null, priceRange: { minMinor: 1, maxMinor: 2 }, isActive: true, sortOrder: 2 },
] as Service[];
const AREAS = [
  { id: "osu", name: "Osu", city: "Accra", region: "Greater Accra", country: "GH", center: { lat: 5.55, lng: -0.17 }, defaultRadiusKm: 8, isActive: true },
] as ServiceArea[];

function technician(overrides: Partial<Technician> = {}): Technician {
  return {
    id: "u1",
    displayName: "Kwame Owusu",
    photoPath: null,
    bio: "",
    yearsExperience: 5,
    serviceIds: [],
    serviceAreas: [],
    weeklyAvailability: [{ day: 1, start: "08:00", end: "18:00" }],
    isOnline: false,
    verificationStatus: "UNSUBMITTED",
    latestVerificationId: null,
    stats: { ratingSum: 0, ratingCount: 0, avgRating: 0, completed: 0, cancelled: 0, offered: 0, responded: 0 },
    activeBookingId: null,
    createdAt: ts,
    ...overrides,
  } as Technician;
}
const ready = (t: Technician): TechnicianState => ({ status: "ready", uid: "u1", technician: t, verifications: [], services: SERVICES, areas: AREAS });
const withWork = { serviceIds: ["plumbing"], serviceAreas: [{ areaId: "osu", name: "Osu", lat: 5.55, lng: -0.17, radiusKm: 8 }] };

describe("RegisterForm", () => {
  it("validates name and experience before submitting", () => {
    const onSubmit = jest.fn();
    render(<RegisterForm onSubmit={onSubmit} />);
    fireEvent.changeText(screen.getByLabelText("Name customers will see"), "X");
    fireEvent.press(screen.getByRole("button", { name: "Register as a provider" }));
    expect(screen.getByText(/letters only/)).toBeTruthy();
    expect(screen.getByText(/years of experience/)).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits the normalized name and a number of years", () => {
    const onSubmit = jest.fn();
    render(<RegisterForm initialName="  Kojo   Asante " onSubmit={onSubmit} />);
    fireEvent.changeText(screen.getByLabelText("Years of experience"), "6 yrs");
    fireEvent.press(screen.getByRole("button", { name: "Register as a provider" }));
    expect(onSubmit).toHaveBeenCalledWith({ displayName: "Kojo Asante", yearsExperience: 6 });
  });
});

describe("WorkSettingsForm", () => {
  const initial = { serviceIds: [], areaIds: [], weeklyAvailability: [{ day: 1, start: "08:00", end: "18:00" }] };

  it("requires a service and an area (shared schema messages)", () => {
    const onSubmit = jest.fn();
    render(<WorkSettingsForm services={SERVICES} areas={AREAS} initial={initial} onSubmit={onSubmit} />);
    fireEvent.press(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/service/i);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits chosen services, areas and normalized hours", () => {
    const onSubmit = jest.fn();
    render(<WorkSettingsForm services={SERVICES} areas={AREAS} initial={initial} onSubmit={onSubmit} />);
    fireEvent.press(screen.getByRole("checkbox", { name: "Plumbing" }));
    fireEvent.press(screen.getByRole("checkbox", { name: "Osu" }));
    fireEvent(screen.getByLabelText("Work on Saturday"), "valueChange", true);
    fireEvent.changeText(screen.getByLabelText("Saturday start"), "9");
    fireEvent.changeText(screen.getByLabelText("Saturday end"), "1330");
    fireEvent.press(screen.getByRole("button", { name: "Save" }));
    expect(onSubmit).toHaveBeenCalledWith({
      serviceIds: ["plumbing"],
      areaIds: ["osu"],
      weeklyAvailability: [
        { day: 1, start: "08:00", end: "18:00" },
        { day: 6, start: "09:00", end: "13:30" },
      ],
    });
  });

  it("rejects an end time before the start time", () => {
    const onSubmit = jest.fn();
    render(<WorkSettingsForm services={SERVICES} areas={AREAS} initial={{ ...initial, serviceIds: ["plumbing"], areaIds: ["osu"] }} onSubmit={onSubmit} />);
    fireEvent.changeText(screen.getByLabelText("Monday end"), "07:00");
    fireEvent.press(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("normalizes typed times", () => {
    expect(normalizeTime("8")).toBe("08:00");
    expect(normalizeTime("830")).toBe("08:30");
    expect(normalizeTime("17.45")).toBe("17:45");
    expect(normalizeTime("abc")).toBe("abc");
  });
});

describe("VerificationForm", () => {
  it("requires a valid ID number and both photos", () => {
    const onSubmit = jest.fn();
    render(<VerificationForm pickPhoto={jest.fn(async () => null)} onSubmit={onSubmit} />);
    fireEvent.changeText(screen.getByLabelText("ID number"), "123");
    fireEvent.press(screen.getByRole("button", { name: "Submit for review" }));
    expect(screen.getByText(/GHA-123456789-0/, { exact: false })).toBeTruthy();
    expect(screen.getByText("Add a photo of your ID")).toBeTruthy();
    expect(screen.getByText("Add a selfie")).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("takes photos with the right cameras and submits the normalized number", async () => {
    const pickPhoto = jest.fn(async (_source: string, camera: string) => `file:///${camera}.jpg`);
    const onSubmit = jest.fn();
    render(<VerificationForm pickPhoto={pickPhoto} onSubmit={onSubmit} />);
    fireEvent.changeText(screen.getByLabelText("ID number"), "gha 1234567890");
    fireEvent.press(screen.getByRole("button", { name: "Take id photo" }));
    await waitFor(() => expect(screen.getByLabelText("ID photo preview")).toBeTruthy());
    fireEvent.press(screen.getByRole("button", { name: "Take selfie" }));
    await waitFor(() => expect(screen.getByLabelText("Selfie preview")).toBeTruthy());
    expect(pickPhoto).toHaveBeenNthCalledWith(1, "camera", "back");
    expect(pickPhoto).toHaveBeenNthCalledWith(2, "camera", "front");
    fireEvent.press(screen.getByRole("button", { name: "Submit for review" }));
    expect(onSubmit).toHaveBeenCalledWith({
      idType: "GHANA_CARD",
      idNumber: "GHA-123456789-0",
      idPhotoUri: "file:///back.jpg",
      selfieUri: "file:///front.jpg",
    });
  });

  it("shows a permission problem instead of failing silently", async () => {
    const pickPhoto = jest.fn(async () => {
      throw new Error("Allow camera access in your phone settings to take the photo.");
    });
    render(<VerificationForm pickPhoto={pickPhoto} onSubmit={jest.fn()} />);
    fireEvent.press(screen.getByRole("button", { name: "Take selfie" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/Allow camera access/));
  });
});

describe("StatusCard", () => {
  it.each<VerificationStatus>(["UNSUBMITTED", "PENDING", "REJECTED", "SUSPENDED"])("has no online switch when %s", (status) => {
    render(<StatusCard status={status} isOnline={false} onToggleOnline={jest.fn()} />);
    expect(screen.queryByLabelText("Online for jobs")).toBeNull();
  });

  it("lets a verified technician go online", () => {
    const onToggle = jest.fn();
    render(<StatusCard status="VERIFIED" isOnline={false} onToggleOnline={onToggle} />);
    expect(screen.getByText("You're offline for jobs")).toBeTruthy();
    fireEvent(screen.getByLabelText("Online for jobs"), "valueChange", true);
    expect(onToggle).toHaveBeenCalledWith(true);
  });
});

describe("TechnicianHome", () => {
  it("invites customers to become providers", () => {
    const onNavigate = jest.fn();
    render(<TechnicianHome state={{ status: "notTech" }} onNavigate={onNavigate} setOnline={jest.fn()} />);
    fireEvent.press(screen.getByRole("button", { name: "Become a provider" }));
    expect(onNavigate).toHaveBeenCalledWith("/tech/register");
  });

  it("guides an unverified technician through the next step", () => {
    const onNavigate = jest.fn();
    render(<TechnicianHome state={ready(technician(withWork))} onNavigate={onNavigate} setOnline={jest.fn()} />);
    expect(screen.getByText("Finish your registration")).toBeTruthy();
    fireEvent.press(screen.getByRole("button", { name: "Submit your ID for verification" }));
    expect(onNavigate).toHaveBeenCalledWith("/tech/verification");
  });

  it("keeps verification locked until services and areas are chosen", () => {
    render(<TechnicianHome state={ready(technician())} onNavigate={jest.fn()} setOnline={jest.fn()} />);
    expect(screen.queryByRole("button", { name: "Submit your ID for verification" })).toBeNull();
    expect(screen.getByRole("button", { name: "Choose your services, areas and hours" })).toBeTruthy();
  });

  it("goes online and reports a failure from the server", async () => {
    const setOnline = jest.fn(async () => {
      throw new Error("Missing or insufficient permissions.");
    });
    render(<TechnicianHome state={ready(technician({ ...withWork, verificationStatus: "VERIFIED" }))} onNavigate={jest.fn()} setOnline={setOnline} />);
    fireEvent(screen.getByLabelText("Online for jobs"), "valueChange", true);
    expect(setOnline).toHaveBeenCalledWith("u1", true);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/permissions/));
  });
});
