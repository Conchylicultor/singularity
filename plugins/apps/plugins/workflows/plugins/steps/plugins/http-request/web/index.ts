import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Workflows } from "@plugins/apps/plugins/workflows/plugins/engine/web";
import { MdHttp } from "react-icons/md";
import { HttpRequestConfig } from "./components/http-request-config";

export default {
  description:
    "HTTP-request step type for workflows. Makes an SSRF-safe outbound HTTP call and emits the response (status, headers, body) as the step output for downstream steps to route on.",
  contributions: [
    Workflows.StepType({
      pluginId: "http-request",
      label: "HTTP Request",
      icon: MdHttp,
      configComponent: HttpRequestConfig,
    }),
  ],
} satisfies PluginDefinition;
