import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import { type Service, watchActiveServices } from "../admin/catalogue-store";
import { useAuth } from "../auth/AuthProvider";
import { type ServiceArea, watchServiceAreas } from "../profile/customer-store";
import { type Technician, type TechnicianStore, type Verification, technicianStore, watchMyVerifications, watchTechnician } from "./technician-store";

export type TechnicianState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      uid: string;
      technician: Technician | null;
      verifications: Verification[];
      services: Service[];
      areas: ServiceArea[];
    };

export interface TechnicianContextValue {
  state: TechnicianState;
  store: TechnicianStore;
}

/** Exported so tests can provide technician state without Firebase. */
export const TechnicianContext = createContext<TechnicianContextValue | null>(null);

/** Live technician profile, own verification history and the service/area catalogues for /tech. */
export function TechnicianProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const uid = session.status === "signedIn" ? session.user.uid : null;
  const [technician, setTechnician] = useState<Technician | null | undefined>(undefined);
  const [verifications, setVerifications] = useState<Verification[] | undefined>(undefined);
  const [services, setServices] = useState<Service[] | undefined>(undefined);
  const [areas, setAreas] = useState<ServiceArea[] | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) return;
    const fail = (e: Error) => {
      console.error("Technician subscription failed", e);
      setError("We couldn't load your provider profile. Check your connection and try again.");
    };
    const subs = [
      watchTechnician(uid, setTechnician, fail),
      watchMyVerifications(uid, setVerifications, fail),
      watchActiveServices(setServices, fail),
      watchServiceAreas(setAreas, fail),
    ];
    return () => subs.forEach((u) => u());
  }, [uid]);

  let state: TechnicianState;
  if (error) state = { status: "error", message: error };
  else if (!uid || technician === undefined || !verifications || !services || !areas) state = { status: "loading" };
  else state = { status: "ready", uid, technician, verifications, services, areas };

  return <TechnicianContext.Provider value={{ state, store: technicianStore }}>{children}</TechnicianContext.Provider>;
}

export function useTechnician(): TechnicianContextValue {
  const ctx = useContext(TechnicianContext);
  if (!ctx) throw new Error("useTechnician must be used inside <TechnicianProvider>");
  return ctx;
}

/** Narrowing helper for pages that only render once the profile is loaded. */
export function useReadyTechnician() {
  const { state, store } = useTechnician();
  return state.status === "ready" && state.technician ? { ...state, technician: state.technician, store } : null;
}
