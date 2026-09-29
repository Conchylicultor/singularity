import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { DepDeclare } from "@plugins/infra/plugins/deps/server";
import { helloPython } from "./internal/dep";

export default {
  description:
    "hello-python: a tiny real `python/` uv project (numpy only) declared as an on-demand dependency — the python kind's end-to-end proof, until the audio pipeline replaces it.",
  contributions: [DepDeclare({ dep: helloPython })],
} satisfies ServerPluginDefinition;
