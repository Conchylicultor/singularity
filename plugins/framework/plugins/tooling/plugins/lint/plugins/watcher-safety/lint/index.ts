import noDirectParcelWatcher from "./no-direct-parcel-watcher";
import noRawFsWatch from "./no-raw-fs-watch";
import type { LintContribution } from "@plugins/framework/plugins/tooling/plugins/lint/core";

export default {
  name: "watcher-safety",
  rules: {
    "no-direct-parcel-watcher": noDirectParcelWatcher,
    // Sibling concern: every other way to watch files (node:fs watch APIs,
    // chokidar). `defineFileWatcher` / `watchForCommand` are the one way.
    "no-raw-fs-watch": noRawFsWatch,
  },
} satisfies LintContribution;
