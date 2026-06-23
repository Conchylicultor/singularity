import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export type { BootPhase, BootSpan, NavTiming, LongTask, AssetTiming, BootTrace } from "../core";
export {
  startBootSpan,
  markBootInstant,
  recordBootSpan,
  getBootTrace,
  subscribeBootTrace,
  bootWindowEnd,
} from "./internal/store";

export default {
  description:
    "Module-level boot-span store imported eagerly by the framework boot path. Captures one-clock boot spans (startBootSpan/markBootInstant/recordBootSpan) and folds in Navigation/Paint Timing plus the first React commit; getBootTrace() assembles the trace.",
  contributions: [],
} satisfies PluginDefinition;
