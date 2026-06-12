import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { storyGeneratedUnitsResource } from "./internal/resource";
import { handleGenerateUnit } from "./internal/routes";
import { storyGenerationGenerateJob } from "./internal/generate-job";
import { generateUnit } from "../shared/endpoints";

export { _storyGeneratedUnits } from "./internal/tables";
export { storyGeneratedUnitsResource } from "./internal/resource";

export default {
  description:
    "Format-agnostic generated-content substrate: LLM-generate text and persist it keyed by (pageId, kind, unitId) with per-unit input-hash + status, pushed over live-state.",
  contributions: [Resource.Declare(storyGeneratedUnitsResource)],
  httpRoutes: {
    [generateUnit.route]: handleGenerateUnit,
  },
  register: [storyGenerationGenerateJob],
} satisfies ServerPluginDefinition;
