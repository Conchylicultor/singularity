import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";

// The impl lives in `core/` (reachable from every runtime, incl. the CLI check
// runner). This barrel is the plugin's server-runtime presence ONLY — it carries
// no re-exports; import the symbols from `@plugins/infra/plugins/spawn/core`.

export default {
  description:
    "Wedge-proof child-process primitive: spawnCaptured/spawnExpectOk capture stdout/stderr via temp-file fds (no piped stdio, so bun 1.3.13's exit-during-stream-pull race has nothing to wedge), spawnPassthrough inherits the parent's streams, and getWorktreeRoot/getMainRepoRoot are the memoized canonical git-root helpers. Node-only (no db/jobs) so a CLI process can import it; the spawn-safety lint rule routes every raw Bun.spawn here.",
} satisfies ServerPluginDefinition;
