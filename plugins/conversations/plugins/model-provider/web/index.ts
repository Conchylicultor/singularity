import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Core } from "@plugins/framework/plugins/web-sdk/core";
import { ConfigV2 } from "@plugins/config_v2/web";
import { modelProviderConfig } from "../shared/config";
import { ModelCorruptionReporter } from "./components/corruption-reporter";

export {
  useVisibleModels,
  useDefaultModel,
  useSetDefaultModel,
} from "./internal/hooks";
export { familyClass } from "./internal/family-class";
export { ModelSelect } from "./components/model-select";
export type { ModelSelectProps } from "./components/model-select";

export default {
  id: "conversations-model-provider",
  name: "Model Provider",
  description: "Registry mapping logical ConversationModel IDs to pinned Claude CLI flags and display metadata.",
  contributions: [
    ConfigV2.WebRegister({ descriptor: modelProviderConfig }),
    Core.Root({ component: ModelCorruptionReporter }),
  ],
} satisfies PluginDefinition;
