import { defineConfig } from "@plugins/config/shared";

export const reviewConfig = defineConfig({
  safePaths: {
    default: ["plugins/", "docs/", "e2e/", "research/", "sidequests/", "bun.lock"] as string[],
    description: "Path prefixes that require no special attention during review.",
    label: "Safe paths",
  },
  carefulPaths: {
    default: ["web/src/plugins.ts", "server/src/db/migrations/meta/"] as string[],
    description: "Path prefixes that deserve extra care (e.g. plugin registry, migration metadata).",
    label: "Careful paths",
  },
});
