import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Text } from "react-native";
import { useAuth } from "../../src/auth/AuthProvider";
import { ErrorText, fieldStyles } from "../../src/components/fields";
import { Screen } from "../../src/components/Screen";
import { JobList } from "../../src/jobs/JobList";
import { type Job, watchMyJobs } from "../../src/jobs/job-store";
import { useNow } from "../../src/jobs/useNow";
import { colors } from "../../src/theme";

export default function JobsScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const now = useNow();
  const uid = session.status === "signedIn" && session.capabilities.tech ? session.uid : null;
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) return;
    return watchMyJobs(uid, setJobs, () => setError("Couldn't load your jobs. Check your connection."));
  }, [uid]);

  return (
    <Screen title="Jobs">
      {!uid ? (
        <Text style={fieldStyles.body}>Jobs appear here once you're a verified ServiceFlow provider.</Text>
      ) : error ? (
        <ErrorText message={error} />
      ) : !jobs ? (
        <ActivityIndicator color={colors.brand} />
      ) : (
        <JobList jobs={jobs} uid={uid} now={now} onOpen={(id) => router.push({ pathname: "/job/[id]", params: { id } })} />
      )}
    </Screen>
  );
}
