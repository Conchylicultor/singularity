import { defineAppDataDir } from "@plugins/infra/plugins/paths/core";
import { chordApp } from "@plugins/apps/plugins/chord/plugins/shell/core";

/**
 * The Chord app's one data dir, `apps/chord`. The song index keeps its source
 * snapshot here (`chordDir.subdir("song-index")`): the compact copy of Sheet
 * Sage's Hooktheory dump that backups keep, so the index survives the upstream
 * files disappearing. The two big downloads it is built from are regenerable
 * and live in a `cache/` dir of their own, never here.
 *
 * `shell/core` must never import this file: it reads `chordApp` from there,
 * so the reverse edge would close a cycle.
 */
export const chordDir = defineAppDataDir(chordApp, {
  owner: "apps/chord",
  description:
    "Chord app files that are the only copy: the song index's compact snapshot of the Sheet Sage Hooktheory dump",
});

export default [chordDir];
