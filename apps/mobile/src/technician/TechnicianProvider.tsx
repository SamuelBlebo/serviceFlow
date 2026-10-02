import { type ServiceDoc, serviceDoc } from "@serviceflow/shared";
import { collection, onSnapshot, orderBy, query, where } from "@react-native-firebase/firestore";
import { COLLECTIONS, parseDocs, type WithId } from "@serviceflow/firebase";
import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { db } from "../lib/firebase";
import {
  type ServiceArea,
  type Technician,
  type TechnicianStore,
  type Verification,
  technicianStore,
  watchMyVerifications,
  watchServiceAreas,
  watchTechnician,
} from "./technician-store";

export type Service = WithId<ServiceDoc>;

export type TechnicianState =
  | { status: "notTech" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; uid: string; technician: Technician; verifications: Verification[]; services: Service[]; areas: ServiceArea[] };

interface TechnicianContextValue {
  state: TechnicianState;
  store: TechnicianStore;
}

export const TechnicianContext = createContext<TechnicianContextValue>({ state: { status: "notTech" }, store: technicianStore });

/**
 * Live technician data for the signed-in provider: their profile, their
 * verification history and the service/area catalogue they choose from.
 * Only subscribes once the session carries the `tech` capability.
 */
export function TechnicianProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const uid = session.status === "signedIn" && session.capabilities.tech ? session.uid : null;
  const [technician, setTechnician] = useState<Technician | null | undefined>(undefined);
  const [verifications, setVerifications] = useState<Verification[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [areas, setAreas] = useState<ServiceArea[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTechnician(undefined);
    setError(null);
    if (!uid) return;
    const fail = (what: string) => (e: Error) => {
      console.warn(`Could not load ${what}`, e);
      setError("Couldn't load your provider details. Check your connection.");
    };
    const unsubs = [
      watchTechnician(uid, setTechnician, fail("technician")),
      watchMyVerifications(uid, setVerifications, fail("verifications")),
      watchServiceAreas(setAreas, fail("areas")),
      onSnapshot(
        query(collection(db(), COLLECTIONS.services), where("isActive", "==", true), orderBy("sortOrder", "asc")),
        (snap) => setServices(parseDocs(serviceDoc, snap.docs)),
        fail("services"),
      ),
    ];
    return () => unsubs.forEach((u) => u());
  }, [uid]);

  let state: TechnicianState;
  if (!uid) state = { status: "notTech" };
  else if (error) state = { status: "error", message: error };
  else if (technician === undefined) state = { status: "loading" };
  else if (technician === null) state = { status: "error", message: "We couldn't find your provider profile. Contact ServiceFlow support." };
  else state = { status: "ready", uid, technician, verifications, services, areas };

  return <TechnicianContext.Provider value={{ state, store: technicianStore }}>{children}</TechnicianContext.Provider>;
}

export function useTechnician(): TechnicianContextValue {
  return useContext(TechnicianContext);
}
