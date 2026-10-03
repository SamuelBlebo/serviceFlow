import { type ComponentType, type ReactNode, Suspense, lazy } from "react";
import { Outlet, createBrowserRouter } from "react-router";
import { FullPageSpinner, RequireAuth, RequireCapability } from "../lib/auth/guards";
import { AdminLoginPage } from "../pages/auth/AdminLoginPage";
import { PhoneLoginPage } from "../pages/auth/PhoneLoginPage";
import { VerifyCodePage } from "../pages/auth/VerifyCodePage";
import { LandingPage } from "../pages/public/LandingPage";

/**
 * The customer area (and anything else that reads Firestore) is code-split:
 * visitors to public pages don't download the Firestore SDK.
 */
function lazyNamed<M, K extends keyof M>(load: () => Promise<M>, name: K) {
  return lazy(async () => ({ default: (await load())[name] as ComponentType<{ children?: ReactNode }> }));
}
const loadProfile = () => import("../lib/profile/CustomerProfileProvider");
const CustomerProfileProvider = lazyNamed(loadProfile, "CustomerProfileProvider");
const RequireCustomerProfile = lazyNamed(loadProfile, "RequireCustomerProfile");
const WelcomePage = lazyNamed(() => import("../pages/customer/WelcomePage"), "WelcomePage");
const CustomerHome = lazyNamed(() => import("../pages/customer/CustomerHome"), "CustomerHome");
const ProfilePage = lazyNamed(() => import("../pages/customer/ProfilePage"), "ProfilePage");
const loadBookings = () => import("../pages/customer/BookingPages");
const RequestServicePage = lazyNamed(loadBookings, "RequestServicePage");
const BookingsPage = lazyNamed(loadBookings, "BookingsPage");
const BookingDetailPage = lazyNamed(loadBookings, "BookingDetailPage");
const loadAdminBookings = () => import("../pages/admin/AdminBookingPages");
const AdminBookingsPage = lazyNamed(loadAdminBookings, "AdminBookingsPage");
const AdminBookingDetailPage = lazyNamed(loadAdminBookings, "AdminBookingDetailPage");
const AdminPaymentsPage = lazyNamed(loadAdminBookings, "AdminPaymentsPage");
const AdminServicesPage = lazyNamed(() => import("../pages/admin/AdminServicesPage"), "AdminServicesPage");
const loadAdminTech = () => import("../pages/admin/AdminTechnicianPages");
const AdminVerificationPage = lazyNamed(loadAdminTech, "AdminVerificationPage");
const AdminTechniciansPage = lazyNamed(loadAdminTech, "AdminTechniciansPage");
const TechnicianProvider = lazyNamed(() => import("../lib/technician/TechnicianProvider"), "TechnicianProvider");
const TechRegisterPage = lazyNamed(() => import("../pages/tech/TechRegisterPage"), "TechRegisterPage");
const TechDashboard = lazyNamed(() => import("../pages/tech/TechDashboard"), "TechDashboard");
const loadTechSettings = () => import("../pages/tech/TechSettingsPages");
const TechAvailabilityPage = lazyNamed(loadTechSettings, "TechAvailabilityPage");
const TechProfilePage = lazyNamed(loadTechSettings, "TechProfilePage");
const TechVerificationPage = lazyNamed(() => import("../pages/tech/TechVerificationPage"), "TechVerificationPage");
const loadTechJobs = () => import("../pages/tech/TechJobsPages");
const TechJobsPage = lazyNamed(loadTechJobs, "TechJobsPage");
const TechJobDetailPage = lazyNamed(loadTechJobs, "TechJobDetailPage");
const loadAdminDash = () => import("../pages/admin/AdminDashboardPages");
const AdminHomePage = lazyNamed(loadAdminDash, "AdminHomePage");
const AdminCustomersPage = lazyNamed(loadAdminDash, "AdminCustomersPage");
const AdminCustomerDetailPage = lazyNamed(loadAdminDash, "AdminCustomerDetailPage");
const AdminTechnicianDetailPage = lazyNamed(loadAdminDash, "AdminTechnicianDetailPage");
const AdminAuditPage = lazyNamed(loadAdminDash, "AdminAuditPage");
const AdminSettingsPage = lazyNamed(() => import("../pages/admin/AdminSettingsPage"), "AdminSettingsPage");

const withSuspense = (node: ReactNode) => <Suspense fallback={<FullPageSpinner />}>{node}</Suspense>;
import { BecomeProviderPage } from "../pages/public/BecomeProviderPage";
import { AboutPage, ContactPage, HowItWorksPage } from "../pages/public/InfoPages";
import { NotFoundPage, PlaceholderPage } from "../pages/public/PlaceholderPage";
import { ServiceDetailPage, ServicesPage } from "../pages/public/ServicesPages";
import { ADMIN_AREA_IDLE_TIMEOUT_MS, AreaLayout, type AreaNavItem } from "./layouts/AreaLayout";
import { PublicLayout } from "./layouts/PublicLayout";

/**
 * Route map (SERVICEFLOW_MIGRATION_PLAN.md §11.2). One app, role-aware
 * areas. Guards are UX only; the server enforces access.
 */

const CUSTOMER_NAV: AreaNavItem[] = [
  { to: "/app", label: "Dashboard" },
  { to: "/app/request", label: "Request service" },
  { to: "/app/bookings", label: "Bookings" },
  { to: "/app/profile", label: "Profile" },
];

const TECH_NAV: AreaNavItem[] = [
  { to: "/tech", label: "Dashboard" },
  { to: "/tech/jobs", label: "Jobs" },
  { to: "/tech/availability", label: "Services & availability" },
  { to: "/tech/earnings", label: "Earnings" },
  { to: "/tech/wallet", label: "Wallet" },
  { to: "/tech/payouts", label: "Payouts" },
  { to: "/tech/reviews", label: "Reviews" },
  { to: "/tech/verification", label: "Verification" },
  { to: "/tech/profile", label: "Profile" },
];

const ADMIN_NAV: AreaNavItem[] = [
  { to: "/admin", label: "Dashboard" },
  { to: "/admin/customers", label: "Customers" },
  { to: "/admin/technicians", label: "Technicians" },
  { to: "/admin/verification", label: "Verification" },
  { to: "/admin/services", label: "Services" },
  { to: "/admin/bookings", label: "Bookings" },
  { to: "/admin/payments", label: "Payments" },
  { to: "/admin/payouts", label: "Payouts" },
  { to: "/admin/disputes", label: "Disputes" },
  { to: "/admin/reports", label: "Reports" },
  { to: "/admin/settings", label: "Settings" },
  { to: "/admin/audit", label: "Audit log" },
];

/** Honest placeholders for nav items a later stage builds, naming that stage. */
function laterStage(nav: AreaNavItem[], base: string, stageFor: Record<string, string>) {
  return nav
    .filter((item) => item.to.slice(base.length + 1) in stageFor)
    .map((item) => {
      const path = item.to.slice(base.length + 1);
      return { path, element: <PlaceholderPage title={item.label} stage={stageFor[path]!} /> };
    });
}

export const routes = [
  {
    element: <PublicLayout />,
    children: [
      { index: true, element: <LandingPage /> },
      { path: "services", element: <ServicesPage /> },
      { path: "services/:slug", element: <ServiceDetailPage /> },
      { path: "how-it-works", element: <HowItWorksPage /> },
      { path: "become-a-provider", element: <BecomeProviderPage /> },
      { path: "about", element: <AboutPage /> },
      { path: "contact", element: <ContactPage /> },
      { path: "login", element: <PhoneLoginPage /> },
      { path: "login/verify", element: <VerifyCodePage /> },
      { path: "admin/login", element: <AdminLoginPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
  {
    // Every signed-in user is a customer. A one-time welcome step creates the
    // customer profile before the rest of the area is shown.
    path: "app",
    element: (
      <RequireAuth>
        {withSuspense(
          <CustomerProfileProvider>
            <Outlet />
          </CustomerProfileProvider>,
        )}
      </RequireAuth>
    ),
    children: [
      { path: "welcome", element: withSuspense(<WelcomePage />) },
      {
        element: withSuspense(
          <RequireCustomerProfile>
            <AreaLayout areaName="Customer" nav={CUSTOMER_NAV} />
          </RequireCustomerProfile>,
        ),
        children: [
          { index: true, element: withSuspense(<CustomerHome />) },
          { path: "profile", element: withSuspense(<ProfilePage />) },
          { path: "request", element: withSuspense(<RequestServicePage />) },
          { path: "bookings", element: withSuspense(<BookingsPage />) },
          { path: "bookings/:id", element: withSuspense(<BookingDetailPage />) },
        ],
      },
    ],
  },
  {
    // Registration is for signed-in users who are not providers yet, so it
    // sits outside the tech-capability gate.
    path: "tech/register",
    element: <RequireAuth>{withSuspense(<TechRegisterPage />)}</RequireAuth>,
  },
  {
    path: "tech",
    element: (
      <RequireAuth>
        <RequireCapability capability="tech">
          {withSuspense(
            <TechnicianProvider>
              <AreaLayout areaName="Service provider" nav={TECH_NAV} />
            </TechnicianProvider>,
          )}
        </RequireCapability>
      </RequireAuth>
    ),
    children: [
      { index: true, element: withSuspense(<TechDashboard />) },
      { path: "availability", element: withSuspense(<TechAvailabilityPage />) },
      { path: "verification", element: withSuspense(<TechVerificationPage />) },
      { path: "profile", element: withSuspense(<TechProfilePage />) },
      { path: "jobs", element: withSuspense(<TechJobsPage />) },
      { path: "jobs/:id", element: withSuspense(<TechJobDetailPage />) },
      ...laterStage(TECH_NAV, "/tech", { earnings: "Wallet and payouts", wallet: "Wallet and payouts", payouts: "Wallet and payouts", reviews: "Ratings" }),
    ],
  },
  {
    path: "admin",
    element: (
      <RequireAuth loginPath="/admin/login">
        <RequireCapability capability="admin">
          <AreaLayout areaName="Admin" nav={ADMIN_NAV} idleTimeoutMs={ADMIN_AREA_IDLE_TIMEOUT_MS} />
        </RequireCapability>
      </RequireAuth>
    ),
    children: [
      { index: true, element: withSuspense(<AdminHomePage />) },
      { path: "customers", element: withSuspense(<AdminCustomersPage />) },
      { path: "customers/:uid", element: withSuspense(<AdminCustomerDetailPage />) },
      { path: "technicians/:uid", element: withSuspense(<AdminTechnicianDetailPage />) },
      { path: "audit", element: withSuspense(<AdminAuditPage />) },
      { path: "settings", element: withSuspense(<AdminSettingsPage />) },
      { path: "payments", element: withSuspense(<AdminPaymentsPage />) },
      { path: "services", element: withSuspense(<AdminServicesPage />) },
      { path: "verification", element: withSuspense(<AdminVerificationPage />) },
      { path: "technicians", element: withSuspense(<AdminTechniciansPage />) },
      { path: "bookings", element: withSuspense(<AdminBookingsPage />) },
      { path: "bookings/:id", element: withSuspense(<AdminBookingDetailPage />) },
      ...laterStage(ADMIN_NAV, "/admin", { payouts: "Wallet and payouts", disputes: "Disputes", reports: "Analytics and reports" }),
    ],
  },
];

export function createRouter() {
  return createBrowserRouter(routes);
}
