# Chord trainer — song index, v2: data lifecycle

Revises [`2026-09-16-apps-chord-trainer-song-index.md`](2026-09-16-apps-chord-trainer-song-index.md) (v1).
**v1 still holds** for the chord converter, the sound token, the tables' columns,
loop shapes, the query and video availability. This doc **replaces v1's
"Importing the dump" section** and adds three things v1 did not cover:

- how a deployed instance gets the data;
- what a worktree gets;
- what goes into backups.

## Context

The user asked three questions about v1:

1. When the app is deployed, where does the data come from?
2. The data is heavy. Is it excluded from worktree database copies, or better,
   cut down to a sample worktrees can still test with?
3. Backups: can the data be recovered if it is left out? If not, how do we keep
   backups small without losing anything?

v1's answers were weak. The import ran on main, and worktrees received the whole
index through the database copy. Backups were not considered.

Facts checked in the code:

- **A worktree's database is a `pg_dump` copy of main's.** The only opt-out,
  `ExcludeFromFork` (`database/admin`), **empties a table completely**. It cannot
  keep some of the rows.
- **A backup runs `pg_dump -Fc` on every non-worktree database**
  (`backup/sources/databases` → `database/admin` `backupDatabase`), **with no
  exclusions**. No backup opt-out exists today.
- **A fresh release boots with an empty database** (`release/CLAUDE.md`). Its
  data root is separate. So a deployed instance must build its own index.
- `isMain()` (`infra/runtime-identity`) tells main apart from a worktree.

Size measured on the dump: the part of the source the index needs (every chord
field, keys, meters, tempos, timing, names, video id; no melody, no editor state)
is **49 MB of JSON, 6.9 MB gzipped**, for 26,175 sections. In Postgres, with
~184k loop windows and their GIN indexes, expect roughly 100 MB (to measure).
Copying that into every worktree, and into every nightly backup, is waste,
because all of it can be rebuilt.

## What can be lost, and what cannot

| Data | Where it comes from | If lost |
|---|---|---|
| Sections and loop windows from the dump | The pinned public Sheet Sage files | **Rebuilt** from the files |
| The chord tokens and features on them | Code (`INDEX_DERIVATION_VERSION`) | **Rebuilt** |
| Sections added later through the Hooktheory API | Hooktheory, which can edit or remove them | **Not reliably recoverable** |
| Video status from the oEmbed sweep | YouTube | Recoverable, but a full sweep takes ~11 h |
| Video errors reported by the player | What the user actually hit | **Not recoverable** |
| The user's answers and progress (future steps) | The user | **Not recoverable** |

So the rule is:

- **Keep the sources of truth in small tables.** They are copied to worktrees
  and backed up.
- **Everything else is a rebuildable cache.** It is left out of both copies and
  rebuilt when missing.

## Design

### 1. A compact source snapshot, built once per machine

The first step does not touch the database. A supervised task streams the two
Sheet Sage files and writes **`sheetsage-<dumpSha>.ndjson.gz`**: one line per
section, with only the source fields the index needs, copied verbatim. It holds
Hookpad chord fields, not tokens. So the snapshot does not depend on the
converter version, and a new converter never requires rebuilding it.

- It lives in the host-global cache data dir, next to the two downloads.
  Worktrees on one machine share it.
- Its name includes the sha256 of both dump files. A different pinned dump means
  a new snapshot.
- If two backends need it at once, a host-wide lock (`packages/flock`) lets one
  build it while the others wait.
- Once built, the two big downloads (116 MB) can be deleted. The snapshot is
  enough to rebuild the index.

This is what makes every later load cheap. Loading 7 MB of JSON lines takes
seconds, where the raw 1.5 GB file takes minutes. It also shrinks the only
irreplaceable copy to 7 MB (see Backups).

### 2. Loading: at boot, on every instance, never on first use

Each instance checks at boot (`onReady`) whether its index is loaded. The check
reads the index tables themselves: a `chord_trainer_index_state` row holding
the snapshot sha, the scope and the derivation version. That row is **in the
same excluded set as the data**, so a restored or forked database with empty
tables also has no row, and it reloads. (It follows the fork rule "exclude
derived state together with its sources".)

If the row is missing or stale, the instance enqueues `song-index.load`
(`defineJob`, singleton):

1. Ensure the snapshot exists: download, check sha256, extract (step 1).
2. Stream the snapshot. Keep only the sections in scope (below). Then call
   `upsertSection` in batches, which derives tokens, features and windows.
3. Re-apply the sections from `chord_trainer_api_documents` (section 4), which
   take precedence over dump rows.
4. Write the state row.

Why at boot rather than on first use: the index is ready by the time the app is
opened. Until it is ready, `findLoopWindows` returns a typed "index loading"
state, never an empty list, so the app shows a loading screen rather than "no
songs". If the download fails, the job fails loudly with a report, then retries.

**What that means for each kind of instance:**

- **Main (your machine).** It downloads 116 MB once, extracts once (minutes, in
  the background), then loads everything.
- **A deployed release (a fresh machine).** Same as main, on its own data root.
  It needs internet access at first boot. Nothing extra ships in the release
  bundle.
- **A worktree.** The tables arrive empty (next section). It loads a **sample**
  from the snapshot already on the machine, in about a second.

### 3. Worktrees get a sample, not a copy

`song-index` declares `ExcludeFromFork` on the sections, loop windows and index
state tables. A worktree then boots with them empty, and step 2 loads its scope.

**The scope is a per-namespace config value** (`config_v2`), `scope: "full" |
"sample"`. Its default comes from `isMain()`: full on main, sample elsewhere.
An agent that needs the full index (for example to measure query speed) sets
`full`, and the next boot loads the rest. The scope is recorded in the state
row, so changing it triggers a reload.

**The sample** is chosen by a fixed rule, so every worktree gets the same songs.
It takes every song whose artist + title hashes into 1 of 20 buckets, with all
of that song's sections. That is about 5%: roughly 1.3k sections and 9k windows
(hashing section ids gave 1,281). It hashes the song, not the section, so a
song's sections stay together. On top of that, a short named list
(`SAMPLE_PINNED_SECTIONS` in `song-index/core`) holds sections that tests and
e2e scripts rely on (key changes, 6/8, rests, a known-gone video). They are
always loaded, so a test never depends on luck.

Nothing new is needed in the fork primitive. It still only empties tables. The
sample comes from the snapshot, not from main's rows.

### 4. Sections from the Hooktheory API go in their own table

v1 mixed dump rows and API rows in one table. A table is copied or excluded as a
whole, so the rows that cannot be recovered need their own table:

**`chord_trainer_api_documents`**: section id, the Hookpad document as fetched
(chords, keys, meters, tempos, endBeat, youtube; no melody or editor state),
artist, song, section name, `fetchedAt`. It is small (a few KB per section),
**copied to worktrees and backed up**.

`chord_trainer_sections` becomes a pure cache built from two sources: the
snapshot and this table. Its `source` column stays, for display and filtering.
The later top-up job writes here first, then calls `upsertSection`.

### 5. Backups

**A new generic primitive in `database/admin`:
`ExcludeFromBackup({ table, reason })`.** `backupDatabase` passes
`--exclude-table-data` for every declared table. The pattern list is built from
the source database's catalog, reusing the fork plan's builder
(`internal/fork-plan.ts`), so a stale name fails the same way it does for forks.
The table's structure stays in the dump; only its rows are left out. After a
restore, the tables exist but are empty. Section 2's boot check sees no state row
and reloads.

It is a separate declaration from `ExcludeFromFork` on purpose. They answer two
different questions:

- `ExcludeFromFork`: does a worktree need these rows?
- `ExcludeFromBackup`: can these rows be rebuilt?

The mail corpus, for instance, is left out of forks but must stay in backups.
The `reason` should say how the rows come back.

**In scope for this work: `traces`.** `debug/trace/engine` already excludes
`traces` from forks. It is 949 MB of 7-day debugging evidence
(`traces`'s 7-day retention job), and it still goes into every backup. It adds
`ExcludeFromBackup({ table: _traces, reason: "7-day debugging evidence, swept
nightly; a restore a week later would find it expired anyway." })`. That makes
the `reason` rule broader than "rebuildable": a table may also be left out
because it expires. So the reason must say either how the rows come back or why
losing them costs nothing. Partition leaves are expanded as the fork plan already
does, ready for when `traces` gets partitioned.

**What the chord trainer backs up:**

| Table / file | Backup |
|---|---|
| `chord_trainer_sections`, `_loop_windows`, `_index_state` | **Excluded** (`ExcludeFromBackup`): rebuilt from the snapshot |
| `chord_trainer_api_documents` | Kept |
| `chord_trainer_videos` | Kept (~13k small rows; saves an 11 h re-sweep; holds the player's reports) |
| Future answers / progress tables | Kept |
| The 7 MB snapshot file | **Kept**, through a small `backup.source` contribution from `song-index` (the prototypes source is the model) |

Why back up the snapshot: the whole index depends on two files on a third-party
GitHub repository. If they disappear, the pinned sha256 cannot be fetched again,
and the dump sections would be lost for good. 7 MB per backup is the cheap
insurance. On restore, if the download fails, the loader looks for the snapshot
in the restored backup before giving up.

With that, the only data not in a backup is exactly what can be rebuilt from
something that is in one.

## Changes to v1's implementation steps

- Step 2 (app root): also declare the cache data dir for the downloads and the
  snapshot.
- **New step, before the song index:** `ExcludeFromBackup` in `database/admin`,
  and backup's databases source honours it; `traces` declares it. Test: a
  backup of a database with a declared table restores with that table present
  and empty. Check on main: the next backup's database dump shrinks by roughly
  the size of `traces` (record the before/after sizes).
- Step 5 (`song-index/server`): replace "supervised import" with the snapshot
  task (§1), the boot check and load job (§2), the fork and backup exclusions
  and the scope config (§3, §5), the `api_documents` table (§4), and the
  snapshot backup source (§5).

## Added verification

1. Main: the first boot downloads, builds the snapshot (~7 MB) and loads 26,175
   sections. A second boot does nothing (the state row matches).
2. A new worktree: the three cache tables arrive empty; the boot loads ~1.3k
   sample sections + the pinned list in a few seconds, without downloading.
   Setting `scope: "full"` loads the rest on the next boot.
3. Before loading finishes, the endpoint answers "index loading", not an empty
   list.
4. Backup: the archive's database dump holds the table structure but no rows for
   the three cache tables, and does hold the snapshot file. Restore it into a
   throwaway database, boot against it: the index reloads from the restored
   snapshot, with the network cut.
5. Bump `INDEX_DERIVATION_VERSION`: the boot re-derives from the snapshot,
   without downloading again.
6. Measure the full index's size in Postgres and record it in the plugin's
   CLAUDE.md, next to the size of the tables that are kept.
