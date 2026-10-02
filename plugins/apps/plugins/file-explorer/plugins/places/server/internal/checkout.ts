import { implement } from "@plugins/infra/plugins/endpoints/server";
import { getMainRepoRoot } from "@plugins/infra/plugins/spawn/core";
import { fileExplorerCheckout } from "../../core";

export const handleCheckout = implement(fileExplorerCheckout, async () => ({
  path: await getMainRepoRoot(),
}));
