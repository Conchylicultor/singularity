import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { UpdaterDeclare } from "@plugins/infra/plugins/deps/plugins/updates/server";
import { uvUpdater } from "./internal/uv-updater";

// A sub-plugin of its own so the python installer kind does not import the
// updater registry: that registry files tasks, and a standalone app that runs
// Python (Sonata, via audio-analysis) must not pull the agent runtime in.

export default {
  description:
    "The `uv` updater: moves every python/ project's uv.lock and its exact .python-version pin (the CPython release) under a 3-day release cooldown, contributed to the infra/deps updater registry.",
  contributions: [UpdaterDeclare({ updater: uvUpdater })],
} satisfies ServerPluginDefinition;
