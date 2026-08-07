import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";

export type { SignalOriginArmResult } from "./internal/signal-origin";
export { armSignalOrigin, readSignalOrigin, signalOriginSourcePath } from "./internal/signal-origin";

export default {
  description:
    "Native SA_SIGINFO signal tap: records WHO sent a fatal signal (sender pid/uid, executable path, and the sender's ancestry captured inside the handler before it is reaped) and chains to the previously installed handler. armSignalOrigin fails open and quiet; readSignalOrigin is a synchronous pure read safe from an exit hook.",
} satisfies ServerPluginDefinition;
