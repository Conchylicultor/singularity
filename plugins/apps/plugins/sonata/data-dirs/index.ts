import { defineAppDataDir } from "@plugins/infra/plugins/paths/core";
import { sonataApp } from "@plugins/apps/plugins/sonata/plugins/shell/core";

/**
 * The Sonata app's one data dir, `apps/sonata`. Today it holds exactly one
 * file — the shared MIDI watched-folder corpus index, written by
 * `sources/midi/folders`.
 *
 * Declared at the app root rather than by the plugin that happens to write into
 * it: an app owns exactly ONE data dir, and every Sonata sub-plugin that needs
 * durable host-global files takes an area inside it
 * (`sonataDir.subdir("<area>")`) instead of declaring an `apps/*` dir of its
 * own. The declaration used to live four levels down in `midi/folders`, with a
 * note asking to move it up the day a second plugin needed the dir; the rule
 * now puts it here from the start.
 *
 * An app dir is never reclaimable as a unit: what a future sub-plugin keeps here
 * need not be re-derivable, so the directory is not a sweeper's to claim even
 * though today's index is. Pure regenerable output belongs in a `cache/` dir.
 *
 * `shell/core` must never import this file: it reads `sonataApp` from there, so
 * the reverse edge would close a cycle.
 */
export const sonataDir = defineAppDataDir(sonataApp, {
  owner: "apps/sonata",
  description:
    "Sonata's host-global app data — currently the shared MIDI watched-folder corpus index",
});

export default [sonataDir];
