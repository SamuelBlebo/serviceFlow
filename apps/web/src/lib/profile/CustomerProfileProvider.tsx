import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router";
import { useAuth } from "../auth/AuthProvider";
import { FullPageSpinner } from "../auth/guards";
import {
  type Address,
  type Customer,
  type CustomerStore,
  type ServiceArea,
  customerStore,
  watchAddresses,
  watchCustomer,
  watchServiceAreas,
} from "./customer-store";

export type CustomerProfileState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; uid: string; customer: Customer | null; addresses: Address[]; areas: ServiceArea[] };

export interface CustomerProfileContextValue {
  state: CustomerProfileState;
  store: CustomerStore;
}

/** Exported so tests can provide profile state without Firebase. */
export const CustomerProfileContext = createContext<CustomerProfileContextValue | null>(null);

/** Live customer profile, saved addresses and the service-area catalogue for the /app area. */
export function CustomerProfileProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const uid = session.status === "signedIn" ? session.user.uid : null;
  const [customer, setCustomer] = useState<Customer | null | undefined>(undefined);
  const [addresses, setAddresses] = useState<Address[] | undefined>(undefined);
  const [areas, setAreas] = useState<ServiceArea[] | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) return;
    const fail = (e: Error) => {
      console.error("Profile subscription failed", e);
      setError("We couldn't load your profile. Check your connection and try again.");
    };
    const unsubscribers = [watchCustomer(uid, setCustomer, fail), watchAddresses(uid, setAddresses, fail), watchServiceAreas(setAreas, fail)];
    return () => unsubscribers.forEach((u) => u());
  }, [uid]);

  let state: CustomerProfileState;
  if (error) state = { status: "error", message: error };
  else if (!uid || customer === undefined || addresses === undefined || areas === undefined) state = { status: "loading" };
  else state = { status: "ready", uid, customer, addresses, areas };

  return <CustomerProfileContext.Provider value={{ state, store: customerStore }}>{children}</CustomerProfileContext.Provider>;
}

export function useCustomerProfile(): CustomerProfileContextValue {
  const ctx = useContext(CustomerProfileContext);
  if (!ctx) throw new Error("useCustomerProfile must be used inside <CustomerProfileProvider>");
  return ctx;
}

/** Sends a signed-in user without a customer profile to the one-time welcome step. */
export function RequireCustomerProfile({ children }: { children: ReactNode }) {
  const { state } = useCustomerProfile();
  const location = useLocation();
  if (state.status === "loading") return <FullPageSpinner />;
  if (state.status === "error") {
    return (
      <p role="alert" className="mx-auto max-w-xl px-4 py-16 text-ink-700">
        {state.message}
      </p>
    );
  }
  if (!state.customer) return <Navigate to="/app/welcome" replace state={{ from: location.pathname + location.search }} />;
  return <>{children}</>;
}
