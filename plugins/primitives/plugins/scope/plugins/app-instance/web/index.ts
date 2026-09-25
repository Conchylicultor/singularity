import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export type { NavigationType } from "./internal/app-instance";
export {
  appInstanceKey,
  getAppInstanceId,
  getNavigationType,
  legacyInstanceKey,
  mayAdoptLegacyPayload,
  readAppInstance,
  stampAppInstance,
} from "./internal/app-instance";

export default {
  description:
    "Per-app-instance generation id: which running SPA state a document belongs to, and the storage-key grammar scoped to it.",
  contributions: [],
} satisfies PluginDefinition;
