import { COLLECTIONS, parseDocs, type WithId } from "@serviceflow/firebase";
import { type ServiceDoc, serviceDoc } from "@serviceflow/shared";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db as firestore } from "../../lib/firebase/firestore";

export type ActiveServicesState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; services: Array<WithId<ServiceDoc>> };

/**
 * Live list of bookable services. The query MUST filter on isActive == true:
 * Security Rules reject any list that could include inactive services.
 */
export function useActiveServices(): ActiveServicesState {
  const [state, setState] = useState<ActiveServicesState>({ status: "loading" });

  useEffect(() => {
    const db = firestore();
    const q = query(collection(db, COLLECTIONS.services), where("isActive", "==", true), orderBy("sortOrder", "asc"));

    return onSnapshot(
      q,
      (snapshot) => {
        const services = parseDocs(serviceDoc, snapshot.docs, (id, error) =>
          console.warn(`Skipping invalid service ${id}`, error),
        );
        setState({ status: "ready", services });
      },
      (error) => {
        console.error("Failed to load services", error);
        setState({ status: "error", message: "We couldn't load services right now." });
      },
    );
  }, []);

  return state;
}
