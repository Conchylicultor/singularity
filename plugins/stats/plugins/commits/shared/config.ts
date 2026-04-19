import { defineConfig } from "@plugins/config/shared";

export const commitsConfig = defineConfig({
  excludedPaths: {
    default: ["research/", "server/src/db/migrations/meta/"] as string[],
    description:
      "File path prefixes eligible for exclusion from line-change stats. Each folder can be toggled on/off individually from the Stats page or Settings.",
    label: "Excluded paths (line stats)",
  },
});
