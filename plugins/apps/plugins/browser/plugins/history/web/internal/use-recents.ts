import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { browserRecentsResource } from "../../shared/resources";

/** Live read of the most-recent distinct-by-url visits (newest first). */
export function useRecents() {
  return useResource(browserRecentsResource);
}
