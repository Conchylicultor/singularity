import { defineResource } from "../../../../server/src/resources";
import { getImproveConfig } from "./config-store";
import type { ImproveConfig } from "../../shared/types";

export const improveConfigResource = defineResource<ImproveConfig>({
  key: "improve.config",
  mode: "push",
  loader: async () => getImproveConfig(),
});
