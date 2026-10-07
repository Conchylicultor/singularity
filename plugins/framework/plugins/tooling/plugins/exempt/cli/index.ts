import { defineCliCommand } from "@plugins/framework/plugins/cli/core";

/**
 * `exempt` is a GROUP: it routes and never runs. `list` answers "who may
 * violate rule X, and why?" from the manifests plugins declare in their own
 * `exempt/index.ts`.
 */
export default defineCliCommand({
  name: "exempt",
  description: "Inspect the exemptions plugins declare in exempt/index.ts",
  subcommands: [
    defineCliCommand<[], { rule?: string; plugin?: string; debt?: boolean }>({
      name: "list",
      description:
        "List every declared exemption, grouped by rule: plugin, path, kind and " +
        "reason (and the task, for debt), with a count per rule and a total.",
      options: [
        {
          flags: "--rule <id>",
          description: "Only this rule (e.g. timer/no-unlisted-timer)",
        },
        {
          flags: "--plugin <path>",
          description:
            "Only exemptions declared by this plugin (path under plugins/, e.g. conversations)",
        },
        {
          flags: "--debt",
          description: "Only debt exemptions (the burndown list, with tasks)",
        },
      ],
      run: () => import("./list"),
    }),
  ],
});
