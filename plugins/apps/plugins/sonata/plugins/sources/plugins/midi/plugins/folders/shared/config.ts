import { defineConfig } from "@plugins/config_v2/core";
import { listField } from "@plugins/fields/plugins/list/plugins/config/core";
import { textField } from "@plugins/fields/plugins/text/plugins/config/core";

// The watched-folder registry. Each item is an absolute directory the MIDI
// folder-watcher mirrors into the Sonata library: `.mid`/`.midi` files are
// auto-imported on create/edit and badged "source deleted" when removed.
//
// Editing is handled for free by config_v2's built-in settings pane (the list
// field renders a drag-sortable add/remove UI). Stored per-worktree at
// `config/<worktree>/apps/sonata/sources/midi/folders/midi-folders.jsonc`.
// `name` is set explicitly to avoid an on-disk filename collision with any
// sibling default-named config.
export const midiFoldersConfig = defineConfig({
  name: "midi-folders",
  fields: {
    folders: listField({
      label: "Watched MIDI folders",
      description:
        "Absolute directories whose .mid/.midi files are auto-imported into the Sonata library and kept in sync.",
      itemFields: {
        path: textField({ label: "Absolute folder path" }),
      },
      default: [],
    }),
  },
});
