import { defineItemActions } from "@plugins/primitives/plugins/data-view/web";
import type { DeployRunRecord } from "@plugins/apps/plugins/deploy/plugins/deployments/core";

/**
 * Trailing-action slot for the History rows — the `DeploymentItemActions`
 * precedent one level down.
 *
 * This section owns no writes and no state (the ledger is the `deployments`
 * sibling's table), so it contributes nothing here itself. The slot exists
 * because *a ledger row is where you learn a run failed*, and what a reader
 * wants next belongs to whoever can offer it: the `investigate-failure` child
 * launches an agent, and a later plugin can add a re-run or an open-the-log
 * action without this section changing.
 */
export const DeployRunItemActions = defineItemActions<DeployRunRecord>();
