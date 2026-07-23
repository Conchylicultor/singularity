import { defineConfig } from "@plugins/config_v2/core";
import { textField } from "@plugins/fields/plugins/text/plugins/config/core";
import { listField } from "@plugins/fields/plugins/list/plugins/config/core";

export const reviewConfig = defineConfig({
  fields: {
    safePaths: listField({
      label: "Safe paths",
      description:
        "Path prefixes that require no special attention during review.",
      itemFields: { path: textField({ label: "Path" }) },
      default: [
        { path: "plugins/" },
        { path: "docs/" },
        { path: "research/" },
        { path: "sidequests/" },
        { path: "bun.lock" },
      ],
    }),
    carefulPaths: listField({
      label: "Careful paths",
      description: "Path prefixes that deserve extra care.",
      itemFields: { path: textField({ label: "Path" }) },
      default: [
        { path: "web/src/plugins.ts" },
        { path: "server/src/db/migrations/meta/" },
      ],
    }),
    sections: listField({
      label: "Review Sections",
      description:
        "Named groups of file patterns for organizing code review.",
      itemFields: {
        name: textField({ label: "Section name" }),
        patterns: listField({
          label: "Patterns",
          itemFields: { pattern: textField({ label: "Pattern" }) },
          default: [],
        }),
      },
      default: [
        {
          name: "Auto-generated",
          patterns: [
            { pattern: "**/CLAUDE.md" },
            { pattern: "docs/plugins-compact.md" },
            { pattern: "docs/plugins-details.md" },
            { pattern: "server/src/db/migrations/" },
          ] as { id: string; pattern: string }[],
        },
      ],
    }),
  },
});
