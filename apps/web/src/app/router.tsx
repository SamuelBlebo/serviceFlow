import { createBrowserRouter } from "react-router";
import { LandingPage } from "../pages/public/LandingPage";
import { NotFoundPage, PlaceholderPage } from "../pages/public/PlaceholderPage";
import { AreaGate, AreaLayout, type AreaNavItem } from "./layouts/AreaLayout";
import { PublicLayout } from "./layouts/PublicLayout";

/**
 * Route map (SERVICEFLOW_MIGRATION_PLAN.md §11.2). One app, role-aware
 * areas. Stage 2 provides the shells; each area's pages are filled in by the
 * stage that builds that domain.
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

function areaRoutes(nav: AreaNavItem[], base: string, capability: "customer" | "tech" | "admin") {
  return nav.map((item) =>
    item.to === base
      ? { index: true, element: <AreaGate capability={capability} /> }
      : { path: item.to.slice(base.length + 1), element: <AreaGate capability={capability} /> },
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
      {
        path: "how-it-works",
        element: <PlaceholderPage title="How it works" stage="Web dashboards" />,
      },
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
      { path: "login", element: <PlaceholderPage title="Sign in" stage="Authentication" /> },
      { path: "admin/login", element: <PlaceholderPage title="Admin sign in" stage="Authentication" /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
  { path: "app", element: <AreaLayout areaName="Customer" nav={CUSTOMER_NAV} />, children: areaRoutes(CUSTOMER_NAV, "/app", "customer") },
  { path: "tech", element: <AreaLayout areaName="Service provider" nav={TECH_NAV} />, children: areaRoutes(TECH_NAV, "/tech", "tech") },
  { path: "admin", element: <AreaLayout areaName="Admin" nav={ADMIN_NAV} />, children: areaRoutes(ADMIN_NAV, "/admin", "admin") },
];

export function createRouter() {
  return createBrowserRouter(routes);
}
