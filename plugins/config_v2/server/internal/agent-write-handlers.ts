import { implement } from "@plugins/infra/plugins/endpoints/core";
import {
  agentWriteLedger as agentWriteLedgerEndpoint,
  revertAgentWrites as revertAgentWritesEndpoint,
} from "../../core";
import { listAgentWrites } from "./agent-write-ledger";
import { revertAgentConfigWrites } from "./registry";

/**
 * What the agent-write ledger currently holds.
 *
 * The e2e harness polls this between closing the browser and reverting: a
 * DataView's write-back is a 400ms trailing debounce, so a POST can still be in
 * flight when the page dies, and `lastWriteAt` going unchanged across a window
 * wider than the debounce is the signal that the writes have stopped arriving.
 */
export const handleAgentWrites = implement(agentWriteLedgerEndpoint, () =>
  listAgentWrites(),
);

/**
 * Restore every config document an agent-origin request overwrote.
 *
 * Returns 200 with a three-armed outcome rather than throwing on partial
 * failure: `failed` is per-document, and the caller (the harness) is the one
 * place that decides a failed revert fails the run. Throwing here would lose
 * the documents that DID revert.
 */
export const handleRevertAgentWrites = implement(
  revertAgentWritesEndpoint,
  async () => revertAgentConfigWrites(),
);
