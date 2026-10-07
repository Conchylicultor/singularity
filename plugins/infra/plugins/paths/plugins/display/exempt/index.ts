import type { Exemptions } from "@plugins/framework/plugins/tooling/plugins/exempt/core";

export default [
  {
    rule: "paths:no-hardcoded-paths",
    paths: ["core/internal/display.ts"],
    kind: "sanctioned",
    reason:
      "The paths written the way a person types them (the home-relative spelling), for prose that TELLS somebody where a directory is: UI empty states, agent prompts, check messages. Its own leaf plugin because the browser needs it and cannot import paths.ts (it reads the home directory at module scope): the path family's owner declaring its own spelling.",
  },
] satisfies Exemptions;
