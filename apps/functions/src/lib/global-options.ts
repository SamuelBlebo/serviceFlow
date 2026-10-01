import { setGlobalOptions } from "firebase-functions/v2";
import { FUNCTIONS_REGION } from "./config";

/**
 * Global Functions options. Imported FIRST by index.ts: ES imports are
 * evaluated in order, and each `onCall`/`onRequest` reads the global options
 * when it is defined — so these must be set before any adapter module loads.
 */
setGlobalOptions({
  region: FUNCTIONS_REGION,
  // Conservative ceiling until real traffic data exists; protects against runaway cost.
  maxInstances: 10,
});
