import { defineDataDir } from "@plugins/infra/plugins/paths/core";

/**
 * The host-global model catalog: one `catalog.json` — every model version this
 * machine has learned of (with when it was first seen and whether it is
 * retired), each family's current version, and the Claude CLI version
 * discovery last read. Host-global because the Claude CLI and its model menu
 * are the machine's, not a worktree's: the host's discovery job writes it,
 * every backend reads and watches it.
 *
 * `state`, not `cache`: the first-seen and retirement history is learned from
 * past menus, and cannot be rebuilt from the CLI's answer today.
 */
export const modelCatalogDir = defineDataDir({
  kind: "state",
  name: "model-catalog",
  owner: "conversations/model-provider/catalog",
  description:
    "The model catalog (catalog.json): every model version this machine knows, each family's current version, retirements, and the Claude CLI version last probed",
  reclaim: {
    kind: "never",
    reason:
      "the first-seen and retirement history cannot be re-derived from the CLI, which only lists what it offers today",
  },
});

export default [modelCatalogDir];
