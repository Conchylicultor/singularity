import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { useGeneratedUnits } from "./hooks";
export type { GenerationTurn } from "./hooks";
export type { GenStatus } from "../core";

export default {
  description:
    "Format-agnostic generated-content substrate: useGeneratedUnits() generates + persists per-unit text keyed by (pageId, kind, unitId) over live-state. No UI.",
  contributions: [],
} satisfies PluginDefinition;
