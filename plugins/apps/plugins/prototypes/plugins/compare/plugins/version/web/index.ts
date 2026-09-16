import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Counterpart } from "@plugins/apps/plugins/prototypes/plugins/compare/web";
import { PrototypeVersionActions } from "@plugins/apps/plugins/prototypes/plugins/gallery/web";
import { VersionCounterpart } from "./components/version-counterpart";
import { CompareWithLatest } from "./components/compare-with-latest";

export default {
  description:
    'The version: counterpart kind for the prototype Compare stage: another version of the prototype itself (version:latest — the live folder — or version:<sha>), framed beside the version on screen at the same width with the same picked options. Never declared by a page: offered as "Latest version" in the stage\'s Against control, and as a "Compare with latest" hover action on every past version in the version list.',
  contributions: [
    Counterpart.Kind({
      match: "version",
      label: "Prototype version",
      presets: [{ ref: "latest", label: "Latest version" }],
      component: VersionCounterpart,
    }),
    PrototypeVersionActions({
      id: "compare-with-latest",
      component: CompareWithLatest,
    }),
  ],
} satisfies PluginDefinition;
