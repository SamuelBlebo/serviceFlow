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

const withSuspense = (node: ReactNode) => <Suspense fallback={<FullPageSpinner />}>{node}</Suspense>;
import { NotFoundPage, PlaceholderPage } from "../pages/public/PlaceholderPage";
import { ADMIN_AREA_IDLE_TIMEOUT_MS, AreaHome, AreaLayout, type AreaNavItem } from "./layouts/AreaLayout";
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
  { to: "/tech/availability", label: "Availability" },
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

function areaRoutes(nav: AreaNavItem[], base: string, areaName: string, stage: string) {
  return nav.map((item) =>
    item.to === base
      ? { index: true, element: <AreaHome areaName={areaName} stage={stage} /> }
      : {
          path: item.to.slice(base.length + 1),
          element: <PlaceholderPage title={item.label} stage={stage} />,
        },
  );
}

export const routes = [
  {
    element: <PublicLayout />,
    children: [
      { index: true, element: <LandingPage /> },
      {
        path: "services",
        element: <PlaceholderPage title="Services" stage="Services">Browse every service we offer across Accra.</PlaceholderPage>,
      },
      { path: "how-it-works", element: <PlaceholderPage title="How it works" stage="Web dashboards" /> },
      {
        path: "become-a-provider",
        element: (
          <PlaceholderPage title="Become a provider" stage="Technician onboarding">
            Join ServiceFlow as a verified professional and get jobs near you.
          </PlaceholderPage>
        ),
      },
      { path: "about", element: <PlaceholderPage title="About ServiceFlow" stage="Web dashboards" /> },
      { path: "contact", element: <PlaceholderPage title="Contact us" stage="Web dashboards" /> },
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
          { path: "request", element: <PlaceholderPage title="Request service" stage="Bookings" /> },
          { path: "bookings", element: <PlaceholderPage title="Bookings" stage="Bookings" /> },
        ],
      },
    ],
  },
  {
    path: "tech",
    element: (
      <RequireAuth>
        <RequireCapability capability="tech">
          <AreaLayout areaName="Service provider" nav={TECH_NAV} />
        </RequireCapability>
      </RequireAuth>
    ),
    children: areaRoutes(TECH_NAV, "/tech", "Service provider", "Technician onboarding"),
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
    children: areaRoutes(ADMIN_NAV, "/admin", "Admin", "Web dashboards"),
  },
];

export function createRouter() {
  return createBrowserRouter(routes);
}
