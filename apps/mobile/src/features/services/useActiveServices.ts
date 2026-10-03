import { collection, onSnapshot, orderBy, query, where } from "@react-native-firebase/firestore";
import { COLLECTIONS, parseDocs } from "@serviceflow/firebase";
import { serviceDoc } from "@serviceflow/shared";
import { useEffect, useState } from "react";
import { db } from "../../lib/firebase";
import type { ServicesState } from "./ServiceList";

/**
 * Live list of bookable services — the same query the web app runs, against
 * the same Security Rules (must filter on isActive == true). React Native
 * Firebase serves cached results first when offline.
 */
export function useActiveServices(): ServicesState {
  const [state, setState] = useState<ServicesState>({ status: "loading" });

  useEffect(() => {
    const q = query(collection(db(), COLLECTIONS.services), where("isActive", "==", true), orderBy("sortOrder", "asc"));
    return onSnapshot(
      q,
      (snapshot) => {
        const services = parseDocs(serviceDoc, snapshot.docs, (id, error) =>
          console.warn(`Skipping invalid service ${id}`, error),
        );
        setState({ status: "ready", services, fromCache: snapshot.metadata.fromCache });
      },
      (error) => {
        console.error("Failed to load services", error);
        setState({ status: "error", message: "Couldn't load services." });
      },
    );
  }, []);

  return state;
}
