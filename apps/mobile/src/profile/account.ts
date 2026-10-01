import { doc, getDoc, onSnapshot, serverTimestamp, writeBatch } from "@react-native-firebase/firestore";
import { paths } from "@serviceflow/firebase";
import { db } from "../lib/firebase";

/**
 * The signed-in user's display name (`users/{uid}.displayName`). Rules let
 * the owner change only this field. If a customer profile exists, its name is
 * kept in step in the same batch.
 */
export function watchDisplayName(uid: string, onName: (name: string) => void, onError: (e: Error) => void): () => void {
  return onSnapshot(
    doc(db(), paths.user(uid)),
    (snap) => onName((snap.data()?.displayName as string | undefined) ?? ""),
    onError,
  );
}

export async function saveDisplayName(uid: string, name: string): Promise<void> {
  const firestore = db();
  const customerRef = doc(firestore, paths.customer(uid));
  const hasCustomerProfile = (await getDoc(customerRef)).exists();
  const batch = writeBatch(firestore);
  batch.update(doc(firestore, paths.user(uid)), { displayName: name });
  if (hasCustomerProfile) batch.update(customerRef, { fullName: name, updatedAt: serverTimestamp() });
  await batch.commit();
}
