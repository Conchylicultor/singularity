import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { onWarmupRun } from "@plugins/infra/plugins/warmup/server";
import { warmupsBackgroundKind } from "./internal/provider";

export default {
  description:
    "Warm-ups in the Background activity catalog: registers the `warmup` background kind — every declared warm-up under After boot, its scope from the warm-up's (host → main only, worktree → every worktree), and its one run in this process (duration, error, or skipped off main) — and pushes the catalog as each warm-up starts and settles. Corpus indexes appear through the warm-up they declare.",
  register: [warmupsBackgroundKind],
  onReady: () => {
    // For the life of the process: the catalog value throttles the pushes.
    onWarmupRun((name) => warmupsBackgroundKind.changed(name));
  },
} satisfies ServerPluginDefinition;
