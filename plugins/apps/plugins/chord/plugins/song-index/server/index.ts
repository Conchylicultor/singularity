import {
  Resource,
  type ServerPluginDefinition,
} from "@plugins/framework/plugins/server-core/core";
import { ConfigV2 } from "@plugins/config_v2/server";
import {
  ExcludeFromBackup,
  ExcludeFromFork,
} from "@plugins/database/plugins/admin/server";
import { ExcludeFromChangeFeed } from "@plugins/database/plugins/change-feed/server";
import { BackupSource } from "@plugins/backup/server";
import {
  ensureChordIndexEndpoint,
  findLoopsEndpoint,
  nextChordsEndpoint,
} from "../core";
import { songIndexConfig } from "../shared/config";
import { assembleSongIndexSnapshot } from "./internal/backup-source";
import { ensureIndexAtBoot } from "./internal/ensure";
import {
  handleEnsureIndex,
  handleFindLoops,
  handleNextChords,
} from "./internal/handlers";
import { songIndexLoadJob } from "./internal/load-job";
import { chordIndexStatusServerResource } from "./internal/status-resource";
import {
  _chordIndexState,
  _chordLoopWindows,
  _chordSections,
} from "./internal/tables";

export default {
  description:
    "The chord app's song index: the Sheet Sage download and snapshot build, the supervised load job, the ensure endpoint, the live load status, the loop queries, and the snapshot's backup source.",
  httpRoutes: {
    [ensureChordIndexEndpoint.route]: handleEnsureIndex,
    [findLoopsEndpoint.route]: handleFindLoops,
    [nextChordsEndpoint.route]: handleNextChords,
  },
  register: [songIndexLoadJob],
  contributions: [
    ConfigV2.Register({ descriptor: songIndexConfig }),
    Resource.Declare(chordIndexStatusServerResource),
    BackupSource({
      id: "chord-song-index",
      name: "Chord song index snapshot",
      assemble: assembleSongIndexSnapshot,
    }),
    // The index is a cache of the snapshot file. A worktree loads its own
    // sample from the machine's snapshot, so main's ~100 MB of rows would only
    // be emptied again; the state row goes with the rows it describes, or a
    // fork would read "ready" over empty tables.
    ExcludeFromFork({
      table: _chordSections,
      reason:
        "Song index cache: a worktree loads its own sample from the machine's snapshot file.",
    }),
    ExcludeFromFork({
      table: _chordLoopWindows,
      reason:
        "Song index cache: a worktree loads its own sample from the machine's snapshot file.",
    }),
    ExcludeFromFork({
      table: _chordIndexState,
      reason:
        "Describes the song index rows, which are left out with it; no row makes the worktree reload its sample.",
    }),
    ExcludeFromBackup({
      table: _chordSections,
      reason:
        "Rebuilt from the song index's snapshot file: with no state row, the next `ensure` or boot (where the app was opened) reloads it.",
    }),
    ExcludeFromBackup({
      table: _chordLoopWindows,
      reason:
        "Rebuilt from the song index's snapshot file: with no state row, the next `ensure` or boot (where the app was opened) reloads it.",
    }),
    ExcludeFromBackup({
      table: _chordIndexState,
      reason:
        "Left out with the index rows it describes: a restored `ready` over empty tables would never reload. With no state row, the next `ensure` or boot (where the app was opened) reloads the index from the snapshot file.",
    }),
    // A load inserts ~184k windows in batches, and no live resource reads these
    // two tables: the status reads only `chord_index_state`.
    ExcludeFromChangeFeed({
      table: _chordSections,
      reason:
        "Bulk-loaded song index cache; no live-state resource reads it (the loop queries are plain endpoints).",
    }),
    ExcludeFromChangeFeed({
      table: _chordLoopWindows,
      reason:
        "Bulk-loaded song index cache; no live-state resource reads it (the loop queries are plain endpoints).",
    }),
  ],
  // Only where the app was opened (the request row exists), and only when the
  // index is missing or stale: a derivation bump, a restore, a fresh fork.
  onReady: () => ensureIndexAtBoot(),
} satisfies ServerPluginDefinition;
