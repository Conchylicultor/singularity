import noDirectParcelWatcher from "./no-direct-parcel-watcher";
import noRawFsWatch from "./no-raw-fs-watch";

export default {
  name: "watcher-safety",
  rules: {
    "no-direct-parcel-watcher": noDirectParcelWatcher,
    // Sibling concern: every other way to watch files (node:fs watch APIs,
    // chokidar). `defineFileWatcher` / `watchForCommand` are the one way.
    "no-raw-fs-watch": noRawFsWatch,
  },
  ignores: {
    // Every path here watches files without the file-watcher primitive. The
    // list is the exception register — add a line only with its reason.
    "no-raw-fs-watch": [
      // The build admission valve, in the CLI process, while a background
      // build is HELD for host duress: a one-shot wake on ONE latch file
      // (unlink or mtime bump), raced against a computed lease deadline and
      // closed on the first event. It runs precisely when the box is in
      // trouble, so it takes the lightest possible watch — a single
      // non-recursive fs.watch on one directory, filtered to one filename —
      // rather than loading @parcel/watcher's native addon and a recursive,
      // debounced subscription for a single wake-up. A foreground wait, not
      // background activity: there is no catalog entry to report into.
      "plugins/framework/plugins/cli/plugins/op-runtime/cli/admission-valve.ts",
    ],
  },
};
