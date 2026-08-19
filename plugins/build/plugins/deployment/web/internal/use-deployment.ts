import { useResource } from "@plugins/primitives/plugins/live-state/web";
import {
  deploymentResource,
  type Carrier,
  type DeploymentState,
} from "../../core";
import { tabCarrier } from "./tab-carrier";

/**
 * What one client knows about the deployment: the server's verdict plus its
 * evidence, and the full carrier set — the server's two deployable pins with
 * THIS tab's own pin composed in beside them.
 *
 * A discriminated union rather than nullable fields, so a consumer cannot read
 * `state` before it exists. `error` rides on the pending arm because that is
 * where live-state puts a transient read failure: a settled result is one the
 * server currently vouches for, and never carries an error.
 */
export type DeploymentReading =
  | { pending: true; error: Error | null }
  | { pending: false; state: DeploymentState; carriers: Carrier[] };

/**
 * The one client-side read of the deployment.
 *
 * It **composes**, it does not derive: `state.kind` is the server's own
 * `convergenceOf` verdict, shipped as the payload's discriminant, so the badge
 * a user reads and the decision the auto-build reconciler makes are the same
 * function of the same git snapshot. Re-deriving the arm here is exactly the
 * split-brain this design exists to remove.
 *
 * The one thing it adds is the `tab` carrier, which is not a derivation either
 * — it is a fact only this tab holds.
 */
export function useDeployment(): DeploymentReading {
  const result = useResource(deploymentResource);
  if (result.pending) return { pending: true, error: result.error };
  return {
    pending: false,
    state: result.data,
    // Order matters only for reading: server, web, then this tab.
    carriers: [...result.data.deployable, tabCarrier()],
  };
}
