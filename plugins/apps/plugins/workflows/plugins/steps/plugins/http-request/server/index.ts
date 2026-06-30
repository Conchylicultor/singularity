import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { httpRequestExecutor } from "./internal/executor";

export default {
  description:
    "HTTP-request step type for workflows. Makes an SSRF-safe outbound HTTP call and emits the response (status, headers, body) as the step output for downstream steps to route on.",
  register: [httpRequestExecutor],
} satisfies ServerPluginDefinition;
