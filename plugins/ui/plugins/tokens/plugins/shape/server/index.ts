import type { ServerPluginDefinition } from "@server/types";
import { shapeConfig } from "../shared";

export default {
  id: "ui-tokens-shape",
  name: "UI: Shape",
  config: shapeConfig,
} satisfies ServerPluginDefinition;
