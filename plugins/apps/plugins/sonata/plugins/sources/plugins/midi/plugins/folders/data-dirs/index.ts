import { defineDataDir } from "@plugins/infra/plugins/paths/core";

/**
 * Sonata's host-global data dir. Today it holds exactly one file — the shared
 * MIDI watched-folder corpus index — which is why the declaration lives in this
 * plugin: a data dir is declared exactly once, by the plugin that reads it.
 *
 * If a second Sonata plugin ever needs a file in here, move this declaration up
 * to a shared Sonata barrel rather than re-declaring the name (a duplicate
 * `${kind}/${name}` throws, by design).
 *
 * `apps` rather than `cache` because the whole `apps/sonata` namespace is the
 * app's own; the index inside it is re-derivable, but the directory as a unit is
 * not something a sweeper may claim.
 */
export const sonataDir = defineDataDir({
  kind: "apps",
  name: "sonata",
  owner: "apps/sonata/sources/midi/folders",
  description:
    "Sonata's host-global app data — currently the shared MIDI watched-folder corpus index",
  reclaim: {
    kind: "never",
    reason:
      "the Sonata app's own data namespace — what a future sub-plugin puts here need not be re-derivable, so the directory is not a sweeper's to claim",
  },
});

export default [sonataDir];
