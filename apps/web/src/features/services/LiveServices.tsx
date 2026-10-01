import { ServiceList } from "./ServiceList";
import { useActiveServices } from "./useActiveServices";

/**
 * The live, Firestore-backed services section. Default-exported so pages can
 * lazy-load it: the Firestore SDK (~400 KB) then downloads in its own chunk
 * after the page shell has rendered, instead of blocking first paint on slow
 * mobile connections.
 */
export default function LiveServices() {
  const services = useActiveServices();
  return <ServiceList state={services} onRetry={() => window.location.reload()} />;
}
