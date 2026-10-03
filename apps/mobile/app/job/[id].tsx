import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Linking, ScrollView, StyleSheet } from "react-native";
import { useAuth } from "../../src/auth/AuthProvider";
import { ErrorText } from "../../src/components/fields";
import { JobView } from "../../src/jobs/JobView";
import { type Job, type JobContact, type JobPhoto, currentLocation, jobStore, watchContact, watchJob, watchPhotos } from "../../src/jobs/job-store";
import { useNow } from "../../src/jobs/useNow";
import { type Payment, paymentStore, watchPayment } from "../../src/payments/payment-store";
import { pickPhoto } from "../../src/technician/photos";
import { colors, space } from "../../src/theme";

/** Opens the first URL the phone can handle (e.g. Google Maps app, else the website). */
async function openFirst(urls: string[]) {
  for (const url of urls) {
    try {
      if (await Linking.canOpenURL(url)) return await Linking.openURL(url);
    } catch {
      // try the next one
    }
  }
  await Linking.openURL(urls[urls.length - 1]!);
}

export default function JobScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const uid = session.status === "signedIn" ? session.uid : "";
  const now = useNow();
  const [job, setJob] = useState<Job | null | undefined>(undefined);
  const [contact, setContact] = useState<JobContact | null>(null);
  const [photos, setPhotos] = useState<JobPhoto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [payment, setPayment] = useState<Payment | null>(null);

  useEffect(() => {
    if (!id) return;
    return watchJob(id, setJob, () => setError("Couldn't load this job. Check your connection."));
  }, [id]);

  // The contact is readable only once the job is accepted: re-subscribe when the status changes.
  const status = job?.status;
  useEffect(() => {
    if (!id || !status) return;
    const unsubs = [watchContact(id, setContact), watchPhotos(id, setPhotos, () => setPhotos([]))];
    if (status === "CUSTOMER_CONFIRMED" || status === "PAID") unsubs.push(watchPayment(id, setPayment));
    return () => unsubs.forEach((u) => u());
  }, [id, status]);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      {error ? (
        <ErrorText message={error} />
      ) : job === undefined ? (
        <ActivityIndicator color={colors.brand} />
      ) : job === null ? (
        <ErrorText message="This job is no longer available to you." />
      ) : (
        <JobView
          job={job}
          uid={uid}
          contact={contact}
          photos={photos}
          now={now}
          store={{ ...jobStore, confirmCash: paymentStore.confirmCash }}
          payment={payment}
          pickPhoto={pickPhoto}
          getLocation={currentLocation}
          openUrl={(urls) => void openFirst(urls)}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({ content: { padding: space[4], paddingBottom: space[10] } });
