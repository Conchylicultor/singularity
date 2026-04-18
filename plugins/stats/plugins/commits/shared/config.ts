import { defineConfig } from "@plugins/config/shared";

export const commitsConfig = defineConfig({
  excludedShas: {
    default: [
      "983277b35b866c200cbee400383fdee63368d7e8",
      "ea912679590b69ad437396232d2a5707ca27e53d",
    ] as string[],
    description:
      "Commits excluded from line-change aggregation. Useful for one-shot scaffolds that distort the stats.",
    label: "Excluded commit SHAs",
  },
  excludedPaths: {
    default: ["research/", "server/src/db/migrations/meta/"] as string[],
    description:
      "File path prefixes excluded from line-change stats when the filter toggle is enabled.",
    label: "Excluded paths (line stats)",
  },
});
