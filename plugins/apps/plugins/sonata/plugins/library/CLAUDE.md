# library

## Navigation (the Sonata panes live here)

Sonata navigation is URL-driven via the pane router — this plugin owns both
panes (it is the natural owner: it already holds `useOpenSong`, the
`Library.Source` registry, and contributes `Sonata.Home`; the shell can't own
them without a `shell → library` import that would cycle with the existing
`library → shell` dependency on `useSonata`).

- `sonataLibraryPane` — index pane at bare `/sonata` (`appIndex: true`,
  standard chrome titled "Library"). Renders the gallery via
  `Sonata.Home` inside `PaneChrome`.
- `sonataPlayerPane` — player pane at `/sonata/song/:songId`. Its own header
  slot (`sonataPlayerPane.Actions`) IS the whole player bar — ← Library, the
  display picker, transport, volume, the jog wheel, and the song title as the
  pane's title item — rendered by `PaneChrome` as one overflow-collapsing row;
  the full-width Transport progress strip lives at the body top, above the
  display. **This plugin's barrel is where every other Sonata plugin reaches
  that header**: it exports `sonataPlayerPane`, and a control is contributed as
  `sonataPlayerPane.Actions({ id, component })`. Which side of the row an item
  lands on is the slot's reorder config
  (`config/apps/sonata/library/sonata-player.actions.jsonc`), not a field on the
  contribution.
  Carries the optimistic title in `input`; its `resolve` hook
  (`useSonataPlayerResolve`) hydrates every `Library.Source`'s raw for the song
  (so direct nav / reload restores it) and gates on the song existing. The
  surface marks the song open on mount (`setCurrentSong`, once per open since
  each open is a fresh `mode:"root"` instance) and publishes the transport to
  the global bus while mounted.

`useOpenSong` opens the player with `openPane(sonataPlayerPane, { songId },
{ mode: "root", hint: { title } })`. The ← Library button calls `clearRoute()`
(empty route → the index pane), which also works for deep-linked players. The
shell mounts `<FullPane/>`, which paints the active pane full-surface.

## Create affordances (`Library.Source.createOption`)

Each input source contributes its "add a song" affordance as a plain-data
`createOption: CreateOption` (the data-view create type) on its `Library.Source`
contribution — **not** a React component. `SongLibrary` maps every source's
`createOption` into the `DataView`'s `creators` prop, which renders them as a
toolbar "+" menu (N sources → menu, not a trailing card). The library stays
source-agnostic: it threads an opaque `s.createOption` and never names MIDI.

Because a `CreateOption.onSelect` is plain data (no component, no hooks), the
open-after-create step can't use the `useOpenSong` hook. Sources call
`openSongImperative(song)` instead — the imperative twin exported from this
plugin's web barrel (`open-song.ts`), which writes to the live pane store via the
imperative `openPane` (mirroring `useOpenSong`'s exact `mode:"root"` + `input`
call). `useOpenSong` is kept for `SongLibrary`'s `onRowActivate`, which runs
inside a component where the caller-aware context store is correct.

## One surface, no bespoke card

The library has NO custom card component. The gallery builds the shared
`DataCard` from the same `FieldDef` schema the table uses, plus a `leading`
music-note block (`viewOptions.gallery.leading`). Everything a card wants is
declared once on the `<DataView>` and honoured by both views:

| Affordance | Where it is declared |
|---|---|
| Play / Pause, Delete | `Library.SongActions` contributions (Play carries `zone: "persistent"`, so it is painted at rest) |
| Ring on the loaded song | `selectedRowId={currentSongId}` |
| Opening a song | `onRowActivate` |
| Anything per-song another plugin knows | a `Library.Fields` field extension |

Which fields the CARD shows is authored config, not code — `visibleFields` on
the `cards` row of `config/apps/sonata/library/sonata.library.jsonc`. Leave it
unauthored and every contributed field stacks another caption row.

## The section column (`SectionPane`)

`Sonata.Section` is a
[detail-sections](../../../../../primitives/plugins/detail-sections/CLAUDE.md)
slot — read that first; it owns the card chrome, the persisted per-section open
state, and the `useAvailable` gate. Sonata-specific on top of it:

- `web/components/section-pane.tsx` owns only the **column**: the
  collapse-to-rail toggle, the scroll body, and two `area`-filtered zones
  (`"editor"` above `"player"`). Each section is painted by the primitive's
  `SonataSectionItem`.
- **A collapsed card's body is unmounted**, so per-song work that must outlive
  the panel lives in a headless `Sonata.Effect` — hence the chord-grid / Ultimate
  Guitar `*PersistObserver`s and `rhythm-controls`' `RhythmObserver`.
- The shell exports the shared `useAvailable` gates `useHasChords` /
  `useHasDerivedChord` / `useHasVoicedChords`.

## The song list (`songLibrary`)

`songLibrary` (`core/resources.ts`, key `"sonata.songs"`) is a `liveCollection`
over `sonata_songs` — H 100, M 500, default order `createdAt desc` — declared
`scroll: true` (the library DataView reads it as a segmented scroll through
`songLibrarySource`, `web/source.ts`, searching title and composer) and
`contributed: true`. Served by `songLibraryServed` (`serveCollection(songLibrary,
{ from: _songs })`), which compiles at boot once the contributions are collected.

- **Contributed columns.** Other plugins add columns to every row — the library
  names none of them. Each declares a `liveColumns` handle in its core and serves
  it over its entity extension (`LiveColumns.Serve(serveColumns(handle, { join:
  ext.join(alias) }))`): playback-history's `playback.playCount` /
  `playback.lastPlayedAt`, the MIDI source's `midi.trackCount` /
  `midi.sourceMissing`. A row carries them under `$columns` (`Song` is
  `WithContributedColumns<SongRow>`), each contributor's `Library.Fields` field
  reads its slice with `handle.read(song)` and binds `handle.column(…)`, so the
  list sorts and filters by them on the server — "Most played", "Recently
  played" and "Unplayed" keep their meaning (a never-played song reads its
  extension default, `playCount = 0`). A play refills exactly that song in the
  tuples that read the join.
- **Field → column.** A library field whose id is not its column binds it:
  `duration` → `durationSec`, `added` → `createdAt`. Field ids stay the persisted
  vocabulary (saved views, presets).
- **Readers.** `SongLibrary` (the DataView; a `useLive(songLibrary, { limit: 1
  })` probe decides the first-run onboarding — settled with no row — and
  otherwise the DataView owns its skeleton and errors); `useCurrentSong`, the
  player title (`useSongTitle`) and its resolve gate (`useSonataPlayerResolve`)
  each read ONE row with `useLiveRow(songLibrary, id)`, whose rows carry
  `$columns` too.
- **Behaviour under a live source.** Nulls sort last in both directions (the
  keyset rule; the nullable sortable columns are `composer`,
  `playback.lastPlayedAt` and `midi.trackCount`), an enum sort or group
  (`source`, the cards view's sections) reads in stored-value order, a section's
  count is exact only once a later section has started in the loaded rows or
  the scroll has read to the end (a library past one window, 100 songs, shows
  its last loaded section as `n+` until then).
- **Custom columns sort and filter server-side.** `songLibrary.columnScope` is
  the library DataView's id (`sonata.library`, asserted at mount), so a
  user-defined custom column binds as `custom.<id>` (the `custom` scoped column
  set — P3 of `research/2026-09-29-global-scoped-change-routing.md`), which
  lifted P2's accepted regression.

## Song title ownership

`sonata_songs.title` has exactly **one** client-side owner: this plugin's
`songLibrary` collection. There is no shell-context mirror of it. Anything that
needs the open song's title reads it through `useCurrentSong()` (the canonical
row for `currentSongId`, one `useLiveRow` point read, preserving the `pending`
discriminant), and the title is *edited* in exactly one place — the inline
`SongTitle` field, which is the player pane's TITLE node
(`title: { component: SongTitle }` on its `Pane.define`, `web/components/song-title-field.tsx`) and
patches `PATCH /api/sonata/songs/:id`
via `updateSong`. Mirroring the `PageHeader` pattern, the pending arm gates the
mount so `useEditableField` only ever seeds from a settled title, and an
empty/whitespace-only draft is never persisted (re-mounting re-seeds from the
canonical value). Source editors (chord-grid, ultimate-guitar) no longer write
the title — a chord-grid save endpoint physically cannot carry one.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Source-agnostic song library landing for Sonata. Renders the gallery of saved songs (via Sonata.Home) and opens a song into the player by collecting every source's raw through the Library.Source registry. Sources contribute persistence/hydration + their own add affordances. Persists source-agnostic Sonata song rows (generic metadata) and serves the `sonata.songs` live collection (sortable and filterable by the columns other plugins contribute). Per-source raw lives in each source's own entity-extension; sources create songs via the exported `createSongRow` helper.
- Web:
  - Slots:
    - `Library.Source` ← `apps.sonata.sources.chord-grid`, `apps.sonata.sources.midi`, `apps.sonata.sources.ultimate-guitar`
    - `Library.SongActions` ← `apps.sonata.library`
    - `Library.Fields` ← `apps.sonata.playback-history`, `apps.sonata.sources.midi`, `apps.sonata.sources.midi.folders`
    - `sonataLibraryPane.Actions` ← `primitives.pane`
    - `sonataPlayerPane.Actions` ← `apps.sonata.audio.engine`, `apps.sonata.audio.metronome`, `apps.sonata.library`, `apps.sonata.pedal.indicator`, `apps.sonata.piano-roll`, `apps.sonata.progress.loop`, `apps.sonata.transport-bar`, `apps.sonata.transpose`, `primitives.pane`
  - Contributes:
    - `Sonata.Home` "library" → `SongLibrary`
    - `sonataPlayerPane.Actions` "back" → `BackToLibrary`
    - `sonataPlayerPane.Actions` "display-picker" → `DisplayPicker`
    - `Library.SongActions` "play" → `PlaySongAction`
    - `Library.SongActions` "delete" → `DeleteSongAction`
    - `Pane.Register` "sonata-library"
    - `Pane.Register` "sonata-player"
  - Uses:
    - `apps/sonata/shell.Sonata`
    - `apps/sonata/shell.SonataSectionItem`
    - `apps/sonata/shell.TEMPO_MATH_FLOOR`
    - `apps/sonata/shell.useSonata`
    - `infra/endpoints.useEndpointMutation`
    - `network/live.LiveRowResult`
    - `network/live.mapRow`
    - `network/live.useLive`
    - `network/live.useLiveRow`
    - `primitives/css/card.Card`
    - `primitives/css/center.Center`
    - `primitives/css/clip.Clip`
    - `primitives/css/column.Column`
    - `primitives/css/fill.Fill`
    - `primitives/css/grid.Grid`
    - `primitives/css/line.Line`
    - `primitives/css/scroll.Scroll`
    - `primitives/css/spacing.Inset`
    - `primitives/css/spacing.Stack`
    - `primitives/css/text.SectionLabel`
    - `primitives/css/text.Text`
    - `primitives/css/ui-kit.Button`
    - `primitives/css/ui-kit.cn`
    - `primitives/css/ui-kit.ControlSize`
    - `primitives/css/ui-kit.ControlSizeProvider`
    - `primitives/css/ui-kit.Input`
    - `primitives/css/ui-kit.useControlSize`
    - `primitives/data-view.CreateOption`
    - `primitives/data-view.DataView`
    - `primitives/data-view.defineDataView`
    - `primitives/data-view.defineFieldExtensions`
    - `primitives/data-view.defineItemActions`
    - `primitives/data-view.liveDataSource`
    - `primitives/editable-field.useEditableField`
    - `primitives/icon-button.IconButton`
    - `primitives/latest-ref.useEventCallback`
    - `primitives/live-state.foldResource`
    - `primitives/live-state.ResourceErrorInline`
    - `primitives/loading.Loading`
    - `primitives/pane.defineRoute`
    - `primitives/pane.Hint`
    - `primitives/pane.openPane`
    - `primitives/pane.Pane`
    - `primitives/pane.PaneChrome`
    - `primitives/pane.ResolveResult`
    - `primitives/pane.resolveRow`
    - `primitives/pane.type`
    - `primitives/pane.useOpenPane`
    - `primitives/pane.usePaneStore`
    - `primitives/persistent-draft.useDraft`
    - `primitives/relative-time.formatRelativeTime`
    - `ui/icons.Icon`
  - Exports (values):
    - `Library`
    - `openSongImperative`
    - `sonataLibraryPane`
    - `sonataPlayerPane`
    - `useCurrentSong`
    - `useOpenSong`
- Server:
  - Contributes:
    - `resource.declare` "sonata.songs"
    - `resource.declare` "sonata.songs:rows"
    - `resource.declare` "sonata.songs:groups"
  - Uses:
    - `database.db`
    - `infra/attachments.Attachments`
    - `infra/endpoints.implement`
    - `infra/entities.defaultNow`
    - `infra/entities.defineEntity`
    - `network/live.serveCollection`
  - DB schema:
    - `plugins/apps/plugins/sonata/plugins/library/server/internal/schema-attachments.ts`
    - `plugins/apps/plugins/sonata/plugins/library/server/internal/tables.ts`
  - Exports (types):
    - `CreateSongRowInput`
    - `UpdateSongMetaInput`
  - Exports (values):
    - `_songs`
    - `createSongRow`
    - `songAttachments`
    - `updateSongMeta`
  - Resources:
    - `sonata.songs` (keyed, window)
    - `sonata.songs:groups` (push)
    - `sonata.songs:rows` (keyed, point)
  - Routes:
    - `DELETE /api/sonata/songs/:id`
    - `PATCH /api/sonata/songs/:id`
- Core:
  - Uses:
    - `fields.FieldsRecord`
    - `fields.fieldsToZodObject`
    - `fields.nullable`
    - `fields/date/config.dateField`
    - `fields/float/config.floatField`
    - `fields/text/config.textField`
    - `infra/endpoints.defineEndpoint`
    - `network/live.liveCollection`
    - `network/live/filter.liveInstant`
    - `network/live/filter.liveNumber`
    - `network/live/filter.liveText`
  - Exports (types):
    - `Song`
    - `UpdateSongBody`
  - Exports (values):
    - `deleteSong`
    - `songLibrary`
    - `SongSchema`
    - `updateSong`
- Cross-plugin:
  - Imported by:
    - `apps/sonata/audio/engine`
    - `apps/sonata/audio/metronome`
    - `apps/sonata/pedal/indicator`
    - `apps/sonata/piano-roll`
    - `apps/sonata/playback-history`
    - `apps/sonata/progress/loop`
    - `apps/sonata/rich/chord-mode`
    - `apps/sonata/rich/key-mode`
    - `apps/sonata/rich/rhythm-controls`
    - `apps/sonata/sources/chord-grid`
    - `apps/sonata/sources/midi`
    - `apps/sonata/sources/midi/folders`
    - `apps/sonata/sources/ultimate-guitar`
    - `apps/sonata/track-mixer`
    - `apps/sonata/transport-bar`
    - `apps/sonata/transpose`
  - Extended by:
    - `apps/sonata/sources/chord-grid` (table `sonata_songs_ext_chord_grid`)
    - `apps/sonata/rich/chord-mode` (table `sonata_songs_ext_chord_mode`)
    - `apps/sonata/rich/key-mode` (table `sonata_songs_ext_key_auto_detect`)
    - `apps/sonata/sources/midi` (table `sonata_songs_ext_midi`)
    - `apps/sonata/playback-history` (table `sonata_songs_ext_playback`)
    - `apps/sonata/rich/rhythm-controls` (table `sonata_songs_ext_rhythm`)
    - `apps/sonata/transpose` (table `sonata_songs_ext_transpose`)
    - `apps/sonata/sources/ultimate-guitar` (table `sonata_songs_ext_ultimate_guitar`)

<!-- AUTOGENERATED:END -->
