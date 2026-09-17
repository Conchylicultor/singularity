import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";

export {
  acquireReleaseCheckout,
  isReleaseCheckout,
  sweepLeakedReleaseCheckouts,
} from "./internal/source-checkout";
export type { ReleaseCheckout, SweepResult } from "./internal/source-checkout";
export { releaseCargoTargetDir } from "../data-dirs";

export default {
  description:
    "The private, detached git checkout a release of committed code builds from: acquire one pinned to a commit (held by a kernel flock for the owning process's life), dispose of it, and sweep the checkouts whose owner died. DB-free so the release CLI can import it.",
} satisfies ServerPluginDefinition;
