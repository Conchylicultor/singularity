# alignment

Aligns an Ultimate Guitar sheet's chord sequence to a YouTube recording's beats,
stores the result per song, and has the UG source compile its `Score` from it,
so a UG song plays on the recording's real beats instead of the synthesized
4/4. Plan: `research/2026-10-01-apps-sonata-ug-alignment-aligner.md`.

## Import graph

The R6 cycle check works at the plugin level, so the edges are drawn to keep it
a DAG:

```
UG web ──▶ alignment core ──▶ tab core ◀── UG (web, server, shared)
alignment server ──▶ UG server (songUltimateGuitar, ugTabSaved)
alignment web ──▶ tab core (UG_SOURCE_ID)  — never UG itself
```

The UG tab model (`UgTab`, the parser, `UG_SOURCE_ID`) is a leaf of its own
(`ultimate-guitar/plugins/tab`), because UG web imports this plugin's core to
compile, and this core reads the tab model. UG's own `core` keeps only the fetch
side. `UgSourceRawSchema` (`{ tab, alignment }`) lives in this core for the same
reason: it names the alignment record.

## Data flow

1. **Video.** The Recording section's link field `PUT`s
   `…/songs/:id/ultimate-guitar/alignment/video { url }`. The handler parses the
   link (`youtubeVideoId`, 400 otherwise), upserts `videoId, status: queued`
   and enqueues the job.
2. **Job** `sonata.ug-alignment.align` (`server/internal/job.ts`, supervised,
   `run` body, `lock` = songId). It reads both rows and decides what to do with
   `decideWork` (`server/internal/work.ts`, pure). Nothing happens with no
   video, a permanent failure, or a record that already matches the current
   video, sheet and aligner. Otherwise the job sets `running/analysing`, calls
   `ensureBeatFeatures(videoId, exec, { log })`, then sets `aligning` and runs
   `alignChords`. It writes `aligned` or `weak` (score vs
   `WEAK_MATCH_THRESHOLD`) with the record. A result is dropped if the video
   changed while the job ran. A throw writes `failed` and rethrows. Only a
   `NonRetryableError` (the video is unavailable) is permanent: `decideWork`
   never retries a permanent failure, not even after a sheet edit, so any
   other failure (a sheet that does not parse included) stays retryable.
3. **Re-check.** `onEnded` runs after the run's lock is released. After a clean
   exit, it re-runs `decideWork` and enqueues again when the sheet or the video
   moved during the run, since an enqueue that lost the claim to the running
   job did nothing. After a kill, it turns a `running` row left behind into
   `failed`.
4. **Sheet edits.** UG's create and update routes emit `sonata.ug.tabSaved
   {songId}`, but only when `content` changed. A `Trigger` binds it to
   `sonata.ug-alignment.on-tab-saved`. That plain job exists because a
   supervised job takes no event payload. It enqueues the align job only when
   the song has a video. UG knows nothing of this plugin.
5. **Player.**
   - Which record goes into `raw.alignment` is one rule, `appliedAlignment`
     (`core/internal/source-raw.ts`): the row's record when it was made for the
     row's current video and `isApplicable` to the open sheet, else `null`. The
     row's `status` plays no part, so a re-align that is queued, running or
     failed leaves the last good alignment of this video and sheet playing, and
     setting a new video drops the old one's at once.
   - UG `hydrate` fetches the tab and the alignment row (`getUgAlignment`)
     together and applies that rule, so an aligned song opens aligned.
   - The `ug-alignment-sync` `Sonata.Effect` (`web/components/alignment-sync.tsx`)
     follows the live row and writes the same rule's result into the raw,
     compared by value, so playback resets at most once per finished job (and
     not at all right after `hydrate`).
   - UG's persist observer saves only when `raw.tab` changes, so this write is
     never taken for an edit.
   - UG `compile()` applies the record only when `isApplicable` (current
     aligner, same `sheetHash`, strong enough), and otherwise falls back to the
     synthesized timeline. A stale record is rejected by construction.
6. **Status.** The Recording section (`area: "editor"`, gated on a UG raw)
   derives a `RecordingState` union from the live row and the open tab
   (`web/internal/recording-state.ts`): loading, no video, queued, aligning
   (phase), aligned (score and signed transpose with capo, "+2 (capo 2)"),
   weak ("needs a better video (31%)"), failed (message, Retry unless
   permanent) and out of date (the record is for another sheet, video or
   aligner version, and nothing is re-aligning). The collapsed `summary` shows the same line.
   Loading is its own arm, never rendered as "no video".

## Storage

`sonata_songs_ext_ug_alignment` (`defineExtension(_songs, "ug_alignment", …)`,
shape `ugAlignmentShape` in `core/internal/row.ts`) has the columns `videoId |
null`, `status` (`queued | running | aligned | weak | failed`), `phase | null`
(`analysing | aligning`), `error | null`, `errorPermanent` and `record | null`
(jsonb decoded by `AlignmentRecordSchema`). It is served as the lookup-only
live collection `sonata-ug-alignment` (`shared/resources.ts`), read with
`useLiveRow(ugAlignmentRows, songId)`.

The job's transcript goes to the `sonata-ug-alignment` log channel.

## Tests

- `core/*.test.ts`: the aligner and `alignedScore` on synthetic features
  (`core/testing/synthFeatures`), and `appliedAlignment`.
- `web/internal/recording-state.test.ts`: the row → `RecordingState` mapping
  and its status line.
- Calibration on real cached features: `scripts/calibrate.ts`.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: UG sheet alignment in the player: a 'Recording' editor section to paste a song's YouTube link and follow its alignment (aligning, aligned with score and transpose, weak match, failed, out of date), and a headless effect writing the applied alignment record into the Ultimate Guitar raw so the Score plays on the recording's beats. UG sheet alignment server: owns the sonata_songs_ext_ug_alignment side-table (video, status, record) served as a lookup-only live collection, the sonata.ug-alignment.align supervised job (beat features → alignChords → record), the set-video / re-align / get endpoints, and a trigger re-aligning a song when its UG sheet changes.
- Web:
  - Contributes:
    - `Sonata.Section` "Recording" → `RecordingSection`
    - `Sonata.Effect` "ug-alignment-sync" → `UgAlignmentSync`
  - Uses:
    - `apps/sonata/document.useSongDocument`
    - `apps/sonata/shell.Sonata`
    - `infra/endpoints.EndpointError`
    - `infra/endpoints.getEndpointErrorMessage`
    - `infra/endpoints.useEndpointMutation`
    - `network/live.LiveRowResult`
    - `network/live.useLiveRow`
    - `primitives/css/fill.Fill`
    - `primitives/css/inline.Inline`
    - `primitives/css/spacing.Stack`
    - `primitives/css/text.Text`
    - `primitives/css/ui-kit.Button`
    - `primitives/css/ui-kit.Input`
    - `primitives/loading.Loading`
- Server:
  - Contributes:
    - `resource.declare` "sonata-ug-alignment:rows"
    - `trigger` "sonata.ug-alignment.on-tab-saved"
  - Uses:
    - `apps/sonata/library._songs`
    - `apps/sonata/sources/ultimate-guitar.songUltimateGuitar`
    - `apps/sonata/sources/ultimate-guitar.ugTabSaved`
    - `infra/audio-analysis.ensureBeatFeatures`
    - `infra/endpoints.HttpError`
    - `infra/endpoints.implement`
    - `infra/entity-extensions.defineExtension`
    - `infra/events.Trigger`
    - `infra/jobs.defineJob`
    - `infra/jobs.isNonRetryableError`
    - `infra/jobs/supervised-job.defineSupervisedJob`
    - `network/live.serveCollection`
    - `primitives/log-channels.defineLogSink`
  - DB schema: `plugins/apps/plugins/sonata/plugins/sources/plugins/ultimate-guitar/plugins/alignment/server/internal/tables.ts`
  - Entity extension of: `apps/sonata/library` (table `sonata_songs_ext_ug_alignment`)
  - Register:
    - `defineSupervisedJob('sonata.ug-alignment.align')`
    - `defineJob('sonata.ug-alignment.on-tab-saved')`
  - Resources: `sonata-ug-alignment:rows` (keyed, point)
  - Routes:
    - `GET /api/sonata/songs/:id/ultimate-guitar/alignment`
    - `PUT /api/sonata/songs/:id/ultimate-guitar/alignment/video`
    - `POST /api/sonata/songs/:id/ultimate-guitar/alignment/realign`
- Core:
  - Uses:
    - `apps/sonata/sources/ultimate-guitar/tab.UgTabSchema`
    - `apps/sonata/theory.parseChordSymbol`
    - `apps/sonata/theory.parseKeySignature`
    - `apps/sonata/theory.qualityToIntervals`
    - `apps/sonata/theory.transposeKey`
    - `apps/sonata/theory.transposeScore`
    - `fields.nullable`
    - `fields/bool/config.boolField`
    - `fields/json/config.jsonField`
    - `fields/text/config.parsedTextField`
    - `fields/text/config.textField`
    - `infra/endpoints.defineEndpoint`
    - `infra/entity-extensions.defineExtensionShape`
  - Exports (types):
    - `AlignmentPhase`
    - `AlignmentSegment`
    - `AlignmentStatus`
    - `UgAlignmentRow`
    - `UgSourceRaw`
  - Exports (values):
    - `alignChords`
    - `alignedScore`
    - `ALIGNER_VERSION`
    - `AlignmentPhaseSchema`
    - `AlignmentRecordSchema`
    - `AlignmentSegmentSchema`
    - `AlignmentStatusSchema`
    - `appliedAlignment`
    - `getUgAlignment`
    - `isApplicable`
    - `realignUg`
    - `setUgAlignmentVideo`
    - `sheetHash`
    - `UgAlignmentRowSchema`
    - `ugAlignmentShape`
    - `UgSourceRawSchema`
    - `WEAK_MATCH_THRESHOLD`
- Test helpers:
  - Core: `@plugins/apps/plugins/sonata/plugins/sources/plugins/ultimate-guitar/plugins/alignment/core/testing`
    - `parsedSheet` — A `ParsedTab` from a terse spelling: one entry per section, each line a space-separated chord row ("C G Am F") placed over an empty lyric, or a `{ lyric }` for a lyric-only line.
    - `synthFeatures` — Synthetic beat features from one chord symbol per beat (`null` = silence: pure noise at low rms; a symbol theory cannot read throws).
    - Types: `SynthFeaturesOptions`

<!-- AUTOGENERATED:END -->
