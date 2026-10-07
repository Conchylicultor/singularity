# alignment

Aligns an Ultimate Guitar sheet's chord sequence to a YouTube recording's beats,
stores the result per song, and has the UG source compile its `Score` from it,
so a UG song plays on the recording's real beats instead of the synthesized
4/4. Plans: `research/2026-10-01-apps-sonata-ug-alignment-aligner.md` (the
aligner), `research/2026-10-07-apps-sonata-ug-alignment-video.md` (choosing the
video automatically).

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

1. **Video.** Two owners, `pick`:
   - `auto` (the resolver): a new UG song (its first `tabSaved`, no row yet)
     gets `{ pick: auto, status: queued }`; "Find a video" (`POST …/resolve`)
     resets a song to that, candidates and record cleared.
   - `user`: the link field (or a click on a candidate) `PUT`s
     `…/alignment/video { url }` — parsed with `youtubeVideoId` (400
     otherwise), upserted as `videoId, pick: user, status: queued`. Nothing
     automatic replaces a user's pick; a resolver run in progress stops at its
     next step. Rows from before `pick` existed are `user` (DB default).
2. **Job** `sonata.ug-alignment.align` (`server/internal/job.ts`, supervised,
   `run` body, `lock` = songId). It reads both rows and decides what to do with
   `decideWork` (`server/internal/decide.ts`, pure, tested): `idle`, `align`
   (the chosen video) or `resolve` (no video and `pick: auto`).
   - **Resolve.** `status: resolving`; with no candidates yet,
     `findSongVideos({ artist, title }, exec)` (`integrations/youtube/song-videos`:
     Hooktheory + YouTube search, embeddable only, ranked) and the ranked list is
     stored in `candidates`. Then `walkCandidates` (pure, tested) tries the
     untried ones in rank order, at most `MAX_TRIES_PER_RUN` (3): features +
     `alignChords` each; the first at or above `WEAK_MATCH_THRESHOLD` becomes
     `videoId` (`aligned`), a weaker one is `weak`. A try that throws is the
     candidate's failure only when its audio could not be had
     (`candidateFailure`: audio-fetch's typed `isYouTubeAudioError` —
     unavailable, or a download that failed, e.g. an HTTP 403): that candidate
     is `failed` with the reason in its `error`, and the walk goes on. Any
     other throw (a dependency that will not install, no network, a bot check,
     a DB error) fails the run, retryable. None passing: `needs-video`, the
     best weak record kept — and played (see Player).
     A sheet edit re-tries the same candidates (`retryScored`). An embed refusal
     — `ReportVideoRefused`, contributed to `SonataRecording.Refused`, posts
     `…/video-refused { videoId, status }` — marks the candidate
     `not-embeddable` (or `failed` when gone) and, for the resolver's own pick,
     queues the walk from the next candidate. Idempotent: the panel re-reports
     on every remount.
   - **Align.** Nothing happens with no video, a permanent failure, or a record
     that already matches the current video, sheet and aligner. Otherwise the
     job sets `running/analysing`, calls `ensureBeatFeatures(videoId, exec, {
     log })`, then sets `aligning` and runs `alignChords`. It writes `aligned`
     or `weak` (score vs `WEAK_MATCH_THRESHOLD`) with the record. A result is
     dropped if the video changed while the job ran. A throw writes `failed` and
     rethrows. Only a `NonRetryableError` (the video is unavailable) is
     permanent: `decideWork` never retries a permanent failure, not even after a
     sheet edit, so any other failure (a sheet that does not parse included)
     stays retryable.
3. **Re-check.** `onEnded` runs after the run's lock is released. After a clean
   exit, it re-runs `decideWork` and enqueues again when the sheet or the video
   moved during the run, since an enqueue that lost the claim to the running
   job did nothing. After a kill, it turns a `running` or `resolving` row left
   behind into `failed`.
4. **Sheet edits.** UG's create and update routes emit `sonata.ug.tabSaved
   {songId}`, but only when `content` changed. A `Trigger` binds it to
   `sonata.ug-alignment.on-tab-saved`. That plain job exists because a
   supervised job takes no event payload. It creates the `auto` row for a song
   with none, and enqueues the align job unless the user's row has no video.
   An edit re-aligns the chosen video; it never re-picks. UG knows nothing of
   this plugin.
5. **Player.**
   - Which record goes into `raw.alignment` is one rule, `appliedAlignment`
     (`core/internal/source-raw.ts`): the row's record when it `fitsSheet`
     (current aligner, same sheet) and is the row's video's — or, with no
     video chosen, the resolver's best try (`needs-video`) — else `null`. The
     score plays no part: a weak match is applied too, so the video plays and
     drives the transport, and the Recording section labels it unconfirmed
     with its score. `WEAK_MATCH_THRESHOLD` only decides whether the resolver
     keeps looking. The row's `status` plays no part either, so a re-align that
     is queued, running or failed leaves the last alignment of this video and
     sheet playing, and setting a new video drops the old one's at once.
   - UG `hydrate` fetches the tab and the alignment row (`getUgAlignment`)
     together and applies that rule, so an aligned song opens aligned.
   - The `ug-alignment-sync` `Sonata.Effect` (`web/components/alignment-sync.tsx`)
     follows the live row and writes the same rule's result into the raw,
     compared by value, so playback resets at most once per finished job (and
     not at all right after `hydrate`).
   - UG's persist observer saves only when `raw.tab` changes, so this write is
     never taken for an edit.
   - UG `compile()` applies the record only when it `fitsSheet` (current
     aligner, same `sheetHash`), and otherwise falls back to the synthesized
     timeline. A stale record is rejected by construction.
6. **Status.** The Recording section (`area: "editor"`, gated on a UG raw)
   derives a `RecordingState` union from the live row and the open tab
   (`web/internal/recording-state.ts`): loading, no video, finding a video
   (the candidate being tried), needs a video (n tried, best score), queued, aligning
   (phase), aligned (score and signed transpose with capo, "+2 (capo 2)"),
   weak ("needs a better video (31%)"), failed (message, Retry unless
   permanent) and out of date (the record is for another sheet, video or
   aligner version, and nothing is re-aligning). The collapsed `summary` shows the same line.
   Loading is its own arm, never rendered as "no video". The body also shows
   the chosen video's title and channel with "picked automatically" / "set by
   you", "Find a video" while there is none, and a disclosure listing the
   candidates (outcome, score, sources); clicking one sets it (`pick: user`).

## Storage

`sonata_songs_ext_ug_alignment` (`defineExtension(_songs, "ug_alignment", …)`,
shape `ugAlignmentShape` in `core/internal/row.ts`) has the columns `videoId |
null`, `status` (`queued | resolving | running | aligned | weak | needs-video |
failed`), `phase | null` (`analysing | aligning`), `error | null`,
`errorPermanent`, `pick` (`auto | user`), `candidates` (jsonb: `{ videoId,
title, channel, rank, sources, outcome: untried | trying | aligned | weak |
failed | not-embeddable, score }[]`) and `record | null` (jsonb decoded by
`AlignmentRecordSchema`). It is served as the lookup-only
live collection `sonata-ug-alignment` (`shared/resources.ts`), read with
`useLiveRow(ugAlignmentRows, songId)`.

The job's transcript goes to the `sonata-ug-alignment` log channel.

## Tests

- `core/*.test.ts`: the aligner and `alignedScore` on synthetic features
  (`core/testing/synthFeatures`), and `appliedAlignment`.
- `server/internal/decide.test.ts`: `decideWork` (resolve arm, user pick
  sticky) and the candidate walk (rank order, threshold, at most 3,
  unavailable, interruption).
- `web/internal/recording-state.test.ts`: the row → `RecordingState` mapping
  and its status line.
- Calibration on real cached features: `scripts/calibrate.ts`.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: UG sheet alignment in the player: a 'Recording' editor section holding the song's YouTube video (the recording plugin's RecordingVideo with its volume — synced to the transport when the song plays on its alignment, a weak match included, else playing on its own) and following how it was found and aligned (finding a video, needs a video, aligning, aligned with score and transpose, weak match, failed, out of date), who picked it, the candidate videos tried (click one to switch), Find a video, and a link field to set one by hand; a headless report of a video the player refuses (SonataRecording.Refused → video-refused), and a headless effect writing the applied alignment record into the Ultimate Guitar raw so the Score plays on the recording's beats. UG sheet alignment server: owns the sonata_songs_ext_ug_alignment side-table (video, who picked it, the resolver's candidates, status, record) served as a lookup-only live collection, the sonata.ug-alignment.align supervised job (choose a video with findSongVideos and walk the best candidates when none was set; beat features → alignChords → record), the set-video / find-a-video / video-refused / re-align / get endpoints, and a trigger that starts choosing a video for a new UG song and re-aligns one whose sheet changes.
- Web:
  - Contributes:
    - `Sonata.Section` "Recording" → `RecordingSection`
    - `Sonata.Effect` "ug-alignment-sync" → `UgAlignmentSync`
    - `SonataRecording.Refused` "ug-video-refused" → `ReportVideoRefused`
  - Uses:
    - `apps/sonata/document.useSongDocument`
    - `apps/sonata/recording.RecordingVideo`
    - `apps/sonata/recording.SonataRecording`
    - `apps/sonata/recording.useMediaRefusal`
    - `apps/sonata/shell.Sonata`
    - `infra/endpoints.EndpointError`
    - `infra/endpoints.getEndpointErrorMessage`
    - `infra/endpoints.useEndpointMutation`
    - `network/live.LiveRowResult`
    - `network/live.useLiveRow`
    - `primitives/collapsible.Collapsible`
    - `primitives/collapsible.CollapsibleChevron`
    - `primitives/collapsible.CollapsibleContent`
    - `primitives/collapsible.CollapsibleTrigger`
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
    - `integrations/youtube/audio-fetch.isYouTubeAudioError`
    - `integrations/youtube/song-videos.findSongVideos`
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
    - `POST /api/sonata/songs/:id/ultimate-guitar/alignment/resolve`
    - `POST /api/sonata/songs/:id/ultimate-guitar/alignment/video-refused`
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
    - `AlignmentCandidate`
    - `AlignmentPhase`
    - `AlignmentSegment`
    - `AlignmentStatus`
    - `CandidateOutcome`
    - `UgAlignmentRow`
    - `UgSourceRaw`
    - `VideoPick`
  - Exports (values):
    - `alignChords`
    - `alignedScore`
    - `ALIGNER_VERSION`
    - `AlignmentPhaseSchema`
    - `AlignmentRecordSchema`
    - `AlignmentSegmentSchema`
    - `AlignmentStatusSchema`
    - `appliedAlignment`
    - `fitsSheet`
    - `getUgAlignment`
    - `realignUg`
    - `refuseUgAlignmentVideo`
    - `resolveUgAlignment`
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
