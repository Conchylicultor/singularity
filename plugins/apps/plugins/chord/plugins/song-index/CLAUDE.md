# song-index

The chord app's index of real songs: every TheoryTab section of Sheet Sage's
Hooktheory dump, read into chords the trainer can compare, and cut into loops.
It answers one question fast: *give me loops whose chords are all unlocked and
that include the chord being learned.* Design: `research/2026-09-16-apps-chord-trainer-song-index.md`
(v1: token, tables, query), `-v2.md` (snapshot, sample, backups), `-v3.md` (load
on first use), `research/2026-09-17-apps-chord-trainer-song-index-v4.md` (this
build).

## Using it

```ts
// Open the index (idempotent). Starts a load when it is missing, stale or failed.
POST /api/chord/index/ensure                → IndexStatus

// Loops made only of `unlocked`, containing `target` (random order).
POST /api/chord/loops/find  { unlocked, target, shape?="bars-4", modes?, requireFeatures?,
                              forbidFeatures?, excludeSectionIds?, limit ≤ 50 }
  → { kind: "not-ready", status } | { kind: "ready", candidates: LoopCandidate[] }

// For each chord outside `unlocked`: how many windows unlocking it adds.
POST /api/chord/loops/next-chords  { unlocked, shape?, modes?, limit? = 20 (≤ 200) }
  → { kind: "not-ready", status } | { kind: "ready", nextChords: { token, windows }[] }
```

`IndexStatus` is also the live resource `chord.index-status`
(`chordIndexStatusResource`): `not-requested` | `loading { phase: queued |
downloading | building-snapshot | loading, done, total }` | `ready { scope,
sections, windows }` | `failed { error }`. Reading it never starts work; only
`ensure` does.

Both reads answer `not-ready` until the status is `ready` — never an empty list,
which would read as "no song fits". A `LoopCandidate` carries the section's
display names, `videoId`, `videoDurationSeconds`, `alignment`, the window's
fields and the section's chords overlapping the window (every Hookpad field plus
its token).

The two reads answer about the same windows:

- A chord's `windows` count is every window of the shape with exactly one chord
  outside the unlocked set — that chord — so unlocking it makes all of them
  `find` answers. It counts windows sharing nothing with the set (a vamp on one
  chord), which is why it scans rather than starting from the GIN index.
- A candidate's chords are the ones its window was derived from: both sides call
  `chordOverlapsWindow`, so a payload can never carry a token the window's
  `chord_tokens` — what "every chord is unlocked" filtered on — does not list.

## The chord token

A chord is keyed by what it SOUNDS like relative to the local tonic, since one
sound has several spellings (D major in C is a V/V or a borrowed lydian II):

```
<root semitones above the tonic>:<stacked root-position intervals>/<inversion>
"0:4-3/0" I     "7:4-3-3/1" V7, first inversion     "10:4-3/0" ♭VII
```

Exact on purpose: a V7 is not a V. A curriculum that wants "V7 counts as V"
widens its own unlocked set. The spelling is kept: every stored chord keeps its
Hookpad fields, and each window has `features` (`seventh`, `extended`,
`inverted`, `applied`, `borrowed`, `suspended`, `altered`, `added`, `omitted`)
for levels that filter on how a chord was written. A rest has no token.

## Alignment

`Alignment` places Hookpad beats (1-based) in the recording:

- `beat-times` — piecewise-linear points: Sheet Sage's per-beat ("refined")
  alignment when it has one, else its two-point start/end one, shifted from
  Sheet Sage's 0-based beats. `beatToSeconds(alignment, beat)`.
- `video-fraction` — Hookpad's own `syncStart`/`syncEnd` as fractions of the
  video's length (a document from the live API). Needs the duration first:
  `resolveVideoFraction(alignment, seconds)`.
- `none` — the section is kept but never looped.

## What is left out, and why

- **The melody (`notes`).** The largest part of each document, unused by the
  trainer. The snapshot builder parses documents with the hooktheory plugin's
  `HookpadHarmonyDocSchema`, so a broken melody cannot refuse a section's
  harmony (`pJkmZPEjxqn`: notes on a `null` beat, a tempo with a `null` bpm).
- **Snapshot skips** (the builder writes a skip line per source entry it cannot
  use, so every load accounts for the whole dump): `no-document`,
  `no-display-names`, `no-processed-section`, `no-raw-entry`,
  `document-refused`. On the pinned dump: 3 × `no-document`, nothing else.
- **Derivation skips** (`deriveSection`, Sheet Sage's rules): `no-chords`,
  `chord-past-end` (a sounding chord ends after `endBeat`),
  `chord-before-first-key`, `unreadable:<rule>` (one chord the converter cannot
  read drops the section). Full scope, pinned dump: 299 `no-chords`, 6
  `chord-past-end`, 6 `unreadable:type,alterations`, 4 `unreadable:alternate`, 2
  `unreadable:root`, 1 each `unreadable:borrowed`, `unreadable:type,adds`,
  `unreadable:duration`.
- **Unloopable sections** stay in `chord_sections` with no windows:
  `unloopableReason` `no-video` or `no-timing`.

Every skip is counted by reason in the state row's `skipped`: a **list** of
`{ reason, count, examples }`, largest first, up to 20 examples each. A list
because it is jsonb, and Postgres orders an object's keys itself.

## Data lifecycle

| What | Where | Forks | Backups |
|---|---|---|---|
| The two dump files (116 MB, pinned commit + sha256) | `cache/chord-sheetsage/` | — | no (refetched) |
| The snapshot `sheetsage-<processed sha>-<raw sha>-v<format>.ndjson.gz` | `apps/chord/song-index/` | — | **yes** (`chord-song-index` backup source) |
| `chord_sections`, `chord_loop_windows`, `chord_index_state` | DB | excluded | excluded |
| `chord_index_request` (the app was opened here) | DB | kept | kept |

1. **Nothing happens until the app is opened.** `ensure` writes the request row,
   then enqueues `chord.song-index.load` unless the state row is `ready` at the
   current snapshot name, scope and `INDEX_DERIVATION_VERSION`. A failed state
   row is deleted first, so the status reads `queued` until the retry runs.
2. **Boot** (`onReady`) runs the same check, only where the request row exists:
   a derivation bump, a restored database or a fresh fork reloads on its own.
3. **The load job** is a supervised job (a detached child, `lock` = one run at a
   time; a second enqueue claims nothing). It re-checks the state row first, then:
   under a host-wide flock (`cache/chord-sheetsage/snapshot.lock`) it downloads
   the missing files and builds the snapshot once per machine; truncates the two
   index tables; streams the snapshot, keeps the scope's sections, derives and
   inserts them in batches of 200 (one transaction per batch); marks the state
   row `ready`. A throw marks it `failed` with the message and rethrows.
4. **No transaction around the whole load, on purpose.** Progress must commit to
   reach the browser, and ~184k uncommitted rows for minutes is the wrong trade.
   The state row is the gate instead: queries answer `not-ready` unless it is
   `ready`, and only the load's last write sets that. A load that dies midway
   leaves `failed` (or a stuck `loading`), and the next load truncates and starts
   over.
5. **Progress reaches the browser through the change feed**: the child writes
   `chord_index_state`, and the push resource re-reads it. The two bulk tables
   are excluded from the change feed; nothing live reads them.

**Scope** (`config`: `scope: auto | full | sample`, default `auto`): `auto` loads
everything on the host singleton (main, or a release's single backend —
`isHostSingleton()`, never `isMain()`) and the worktree sample elsewhere. The
sample is every song whose slugs hash into bucket 0 of 20, plus
`SAMPLE_PINNED_SECTIONS`. A change reloads on the next `ensure` or boot.

## Measured (pinned dump, 2026-09-17)

- Snapshot build: 44–48 s for both files (after a 6 s download), **8.7 MB**
  gzipped (115 MB of JSON lines once unzipped: every Hookpad chord field, in full).
- Full scope: 26,178 lines → **25,855 sections** stored, 21,723 with windows,
  **183,270 `bars-4` windows**; the sections' compacted chords are 31 MB of JSON.
- Sample scope: 1,346 lines → 1,328 sections, 1,108 with windows, 9,612 windows.
- Deriving the whole snapshot without a database: ~5 s.
- Reading the snapshot: 2.6 s to decode every line in full, 0.87 s for the four
  fields a load counts its total with (`readSnapshotHeads`) — so a load decodes
  it once, not twice.
- `find` on the full index: p95 31 ms over 100 random unlocked sets, inside the
  < 50 ms target (`e2e/song-index-verify.ts`).
- `next-chords` on the full index (a scan of the 183,270 windows): 87 ms for one
  unlocked chord, 119 ms for eight (median of 6).
- Still to measure after a deploy: load time into Postgres and table sizes
  (`pg_total_relation_size`).

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Settings registration for the song index's load scope. The chord app's song index: the Sheet Sage download and snapshot build, the supervised load job, the ensure endpoint, the live load status, the loop queries, and the snapshot's backup source.
- Web:
  - Contributes: `ConfigV2.WebRegister` "config"
  - Uses: `config_v2.ConfigV2`
- Server:
  - Contributes:
    - `ConfigV2.Register` "config"
    - `resource.declare` "chord.index-status"
    - `backup.source` "Chord song index snapshot"
    - `fork-data-exclusion` "chord_sections"
    - `fork-data-exclusion` "chord_loop_windows"
    - `fork-data-exclusion` "chord_index_state"
    - `backup-data-exclusion` "chord_sections"
    - `backup-data-exclusion` "chord_loop_windows"
    - `backup-data-exclusion` "chord_index_state"
    - `change-feed-exclusion` "chord_sections"
    - `change-feed-exclusion` "chord_loop_windows"
  - Uses:
    - `backup.BackupSource`
    - `config_v2.ConfigV2`
    - `config_v2.getConfig`
    - `database.db`
    - `database/admin.ExcludeFromBackup`
    - `database/admin.ExcludeFromFork`
    - `database/change-feed.ExcludeFromChangeFeed`
    - `database/sql-column.parsedJson`
    - `database/sql-column.parsedText`
    - `infra/endpoints.implement`
    - `infra/jobs/supervised-job.defineSupervisedJob`
    - `primitives/log-channels.defineLogSink`
  - DB schema: `plugins/apps/plugins/chord/plugins/song-index/server/internal/tables.ts`
  - Register: `defineSupervisedJob('chord.song-index.load')`
  - Resources: `chord.index-status` (push)
  - Routes:
    - `POST /api/chord/index/ensure`
    - `POST /api/chord/loops/find`
    - `POST /api/chord/loops/next-chords`
- Core:
  - Uses:
    - `infra/endpoints.defineEndpoint`
    - `integrations/hooktheory.HookpadChord`
    - `integrations/hooktheory.HookpadChordRule`
    - `integrations/hooktheory.HookpadChordSchema`
    - `integrations/hooktheory.hookpadChordSound`
    - `integrations/hooktheory.HookpadHarmonyDocSchema`
    - `integrations/hooktheory.HookpadKey`
    - `integrations/hooktheory.hookpadKeyAt`
    - `integrations/hooktheory.HookpadMeter`
    - `integrations/hooktheory.HookpadMode`
    - `integrations/hooktheory.HookpadModeSchema`
    - `integrations/hooktheory.hookpadTonicPc`
    - `integrations/hooktheory.TheorytabSectionIdSchema`
    - `primitives/live-state.resourceDescriptor`
  - Exports (types):
    - `Alignment`
    - `BeatTimesAlignment`
    - `ChordFeature`
    - `ChordToken`
    - `ChordTokenParts`
    - `DerivedSection`
    - `DeriveSectionInput`
    - `FindLoopsBody`
    - `IndexedChord`
    - `IndexLoadPhase`
    - `IndexPhase`
    - `IndexScopeSetting`
    - `IndexStatus`
    - `LoadScope`
    - `LoopCandidate`
    - `LoopSectionInput`
    - `LoopShape`
    - `LoopShapeId`
    - `LoopWindow`
    - `NextChordCount`
    - `NextChordsBody`
    - `SectionLoops`
    - `SectionSkipReason`
    - `SectionUnloopableReason`
    - `SheetSageAlignment`
    - `SkipSummary`
    - `SkipSummaryEntry`
    - `SnapshotLine`
    - `SnapshotSection`
    - `SnapshotSkip`
    - `SnapshotSkipReason`
    - `StoredChord`
    - `TokenizedChord`
    - `VideoFractionAlignment`
  - Exports (values):
    - `alignmentFromSheetSage`
    - `AlignmentSchema`
    - `beatTimesAlignment`
    - `beatToSeconds`
    - `CHORD_FEATURES`
    - `chordFeatures`
    - `chordIndexStatusResource`
    - `chordOverlapsWindow`
    - `chordToken`
    - `chordTokenFromParts`
    - `ChordTokenSchema`
    - `compactChord`
    - `deriveSection`
    - `ensureChordIndexEndpoint`
    - `expandChord`
    - `FIND_LOOPS_MAX_LIMIT`
    - `FindLoopsBodySchema`
    - `findLoopsEndpoint`
    - `fnv1a32`
    - `INDEX_DERIVATION_VERSION`
    - `INDEX_LOAD_PHASES`
    - `INDEX_SCOPE_SETTINGS`
    - `IndexLoadPhaseSchema`
    - `IndexPhaseSchema`
    - `IndexStatusSchema`
    - `isInLoadScope`
    - `isInSample`
    - `LoadScopeSchema`
    - `LOOP_SHAPE_IDS`
    - `LOOP_SHAPES`
    - `LoopCandidateSchema`
    - `LoopWindowFieldsSchema`
    - `NEXT_CHORDS_MAX_LIMIT`
    - `NextChordCountSchema`
    - `NextChordsBodySchema`
    - `nextChordsEndpoint`
    - `parseChordToken`
    - `resolveLoadScope`
    - `resolveVideoFraction`
    - `SAMPLE_BUCKETS`
    - `SAMPLE_PINNED_SECTIONS`
    - `sampleBucket`
    - `SheetSageAlignmentSchema`
    - `SheetSageBeatTimesSchema`
    - `SKIP_EXAMPLES_PER_REASON`
    - `SkipSummaryEntrySchema`
    - `SkipSummarySchema`
    - `SkipTally`
    - `SNAPSHOT_FORMAT_VERSION`
    - `SNAPSHOT_SKIP_REASONS`
    - `SnapshotLineSchema`
    - `SnapshotSectionSchema`
    - `SnapshotSkipReasonSchema`
    - `SnapshotSkipSchema`
    - `StoredChordSchema`
    - `TokenizedChordSchema`

<!-- AUTOGENERATED:END -->
