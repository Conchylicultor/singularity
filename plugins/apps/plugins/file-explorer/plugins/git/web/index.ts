import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { FileBrowserSlots } from "@plugins/apps/plugins/file-explorer/plugins/browser/web";
import { GitFields } from "./components/git-fields";
import { useGitLens } from "./internal/git-lens";

export default {
  description:
    "Git awareness for the file explorer: inside a git checkout the tree gains a git status badge (M / A / D / R / C / ?, a dot on a folder holding changes; pending until the status is known) and a Changed vs main filter field, ignored files hide behind a Show ignored files toggle, and a changed file's preview gets its git context (the Diff tab).",
  contributions: [
    FileBrowserSlots.Fields({
      id: "git",
      section: "Git",
      component: GitFields,
    }),
    FileBrowserSlots.Lens({ id: "git", useLens: useGitLens }),
  ],
} satisfies PluginDefinition;
