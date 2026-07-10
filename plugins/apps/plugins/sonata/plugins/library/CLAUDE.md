# library

## Navigation (the Sonata panes live here)

Sonata navigation is URL-driven via the pane router — this plugin owns both
panes (it is the natural owner: it already holds `useOpenSong`, the
`Library.Source` registry, and contributes `Sonata.Home`; the shell can't own
them without a `shell → library` import that would cycle with the existing
`library → shell` dependency on `useSonata`).

- `sonataLibraryPane` — index pane at bare `/sonata` (`segment: ""`,
  `appPath: "/sonata"`, standard chrome titled "Library"). Renders the gallery via
  `Sonata.Home` inside `PaneChrome`.
- `sonataPlayerPane` — player pane at `/sonata/song/:songId`
  (`chrome: { header: SonataToolbar }` — the `SonataToolbar` Start/End zones ARE
  the pane header, rendered by `PaneChrome`; the full-width Transport progress
  strip lives at the body top, above the display).
  Carries the optimistic title in `input`; its `resolve` hook
  (`useSonataPlayerResolve`) hydrates every `Library.Source`'s raw for the song
  (so direct nav / reload restores it) and gates on the song existing. The
  surface marks the song open on mount (`setCurrentSong`, once per open since
  each open is a fresh `mode:"root"` instance) and publishes the transport to
  the global bus while mounted.

`useOpenSong` opens the player with `openPane(sonataPlayerPane, { songId },
{ mode: "root", input: { title } })`. The ← Library button calls `clearRoute()`
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
call). `useOpenSong` is kept for the gallery cards, which open from inside a
component where the caller-aware context store is correct.

## The section column (`SectionPane`)

`web/components/section-pane.tsx` is the host for every `Sonata.Section`
contribution — and it owns their **chrome**. A section supplies a `label`, an
`icon`, and a body `component`; the host wraps each one in the shared
[`SectionCard`](../../../../../primitives/plugins/section-card/CLAUDE.md)
primitive (a `Card` + a collapsible title row). Three consequences worth knowing
before you add a section:

- **Cards are collapsed by default**, showing only the title row. Clicking the
  title expands it; the choice persists per section, per device (`useDraft`,
  key `sonata.section.<id>.open`). The column therefore reads as a list of
  titles, not a wall of panels.
- **A collapsed card's body is UNMOUNTED.** Anything that must keep running for
  the open song regardless of the panel's state — debounced persistence, a
  transport subscription that outlives the panel — belongs in a headless
  always-mounted `Sonata.Effect`, not in the body. This is why the chord-grid and
  Ultimate Guitar editors persist from `*PersistObserver` components rather than
  from their editor sections, and why `rhythm-controls` writes the groove from
  `RhythmObserver`.
- **A section can no longer opt out with `return null`** — the host has already
  painted the title by then, leaving an empty card. "This section doesn't apply
  to the open song" is declared on the contribution as `useAvailable?: () =>
  boolean` (the shell exports the shared `useHasChords` / `useHasAuthoredChord`
  gates); the host runs it first and paints nothing when it is false.
- Controls that must stay reachable while collapsed (an on/off switch, a reset
  button) go in the contribution's `actions?: ComponentType`, rendered as a
  sibling of the title trigger.

## Song title ownership

`sonata_songs.title` has exactly **one** client-side owner: this plugin's
`songsResource`. There is no shell-context mirror of it. Anything that needs the
open song's title reads it through `useCurrentSong()` (the canonical row for
`currentSongId`, straight from `songsResource`, preserving the `pending`
discriminant), and the title is *edited* in exactly one place — the inline
`SongTitle` field in the player toolbar (`SonataToolbar.Start` "title",
`web/components/song-title-field.tsx`), which patches `PATCH /api/sonata/songs/:id`
via `updateSong`. Mirroring the `PageHeader` pattern, `matchResource` gates the
mount so `useEditableField` only ever seeds from a settled title, and an
empty/whitespace-only draft is never persisted (re-mounting re-seeds from the
canonical value). Source editors (chord-grid, ultimate-guitar) no longer write
the title — a chord-grid save endpoint physically cannot carry one.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Source-agnostic song library landing for Sonata. Renders the gallery of saved songs (via Sonata.Home) and opens a song into the player by collecting every source's raw through the Library.Source registry. Sources contribute persistence/hydration + their own add affordances. Persists source-agnostic Sonata song rows (generic metadata) and serves the reactive song list. Per-source raw lives in each source's own entity-extension; sources create songs via the exported `createSongRow` helper.
- Web:
  - Slots: `Library.Source` ← `apps.sonata.sources.chord-grid`, `apps.sonata.sources.midi`, `apps.sonata.sources.ultimate-guitar`, `Library.CardMeta` ← `apps.sonata.playback-history`, `apps.sonata.sources.midi`, `apps.sonata.sources.midi.folders`, `Library.SongActions` ← `apps.sonata.library`, `Library.Fields` ← `apps.sonata.playback-history`
  - Contributes: `Sonata.Home` "library" → `SongLibrary`, `SonataToolbar.Start` "back" → `BackToLibrary`, `SonataToolbar.Start` "title" → `SongTitle`, `SonataToolbar.Start` "display-picker" → `DisplayPicker`, `Library.SongActions` "play" → `PlaySongAction`, `Pane.Register` "sonata-library", `Pane.Register` "sonata-player"
  - Uses: `apps/sonata/shell.Sonata`, `apps/sonata/shell.SonataSection`, `apps/sonata/shell.SonataToolbar`, `apps/sonata/shell.TEMPO_MATH_FLOOR`, `apps/sonata/shell.useSonata`, `infra/endpoints.useEndpointMutation`, `primitives/css/card.Card`, `primitives/css/center.Center`, `primitives/css/clip.Clip`, `primitives/css/column.Column`, `primitives/css/fill.Fill`, `primitives/css/grid.Grid`, `primitives/css/line.Line`, `primitives/css/pin.Pin`, `primitives/css/scroll.Scroll`, `primitives/css/spacing.Inset`, `primitives/css/spacing.Stack`, `primitives/css/text.Text`, `primitives/css/ui-kit.Button`, `primitives/css/ui-kit.cn`, `primitives/css/ui-kit.ControlSize`, `primitives/css/ui-kit.ControlSizeProvider`, `primitives/css/ui-kit.Input`, `primitives/css/ui-kit.useControlSize`, `primitives/data-view.CreateOption`, `primitives/data-view.DataView`, `primitives/data-view.defineDataView`, `primitives/data-view.defineFieldExtensions`, `primitives/data-view.defineItemActions`, `primitives/editable-field.useEditableField`, `primitives/hover-reveal.hoverRevealGroup`, `primitives/hover-reveal.hoverRevealTarget`, `primitives/icon-button.IconButton`, `primitives/latest-ref.useEventCallback`, `primitives/live-state.matchResource`, `primitives/live-state.ResourceResult`, `primitives/live-state.useResource`, `primitives/loading.Loading`, `primitives/overflow-menu.OverflowMenu`, `primitives/overflow-menu.OverflowMenuItem`, `primitives/pane.openPane`, `primitives/pane.Pane`, `primitives/pane.PaneChrome`, `primitives/pane.type`, `primitives/pane.useOpenPane`, `primitives/pane.usePaneStore`, `primitives/persistent-draft.useDraft`, `primitives/relative-time.formatRelativeTime`, `primitives/section-card.SectionCard`, `primitives/slot-render.defineRenderSlot`
  - Exports: Values: `Library`, `openSongImperative`, `useCurrentSong`, `useOpenSong`
- Server:
  - Uses: `database.db`, `infra/attachments.Attachments`, `infra/endpoints.implement`, `infra/entities.defaultNow`, `infra/entities.defineEntity`
  - DB schema: `plugins/apps/plugins/sonata/plugins/library/server/internal/schema-attachments.ts`, `plugins/apps/plugins/sonata/plugins/library/server/internal/tables.ts`
  - Exports: Types: `CreateSongRowInput`, `UpdateSongMetaInput`; Values: `_songs`, `createSongRow`, `songAttachments`, `songsLiveResource`, `updateSongMeta`
  - Routes: `DELETE /api/sonata/songs/:id`, `PATCH /api/sonata/songs/:id`
- Core:
  - Uses: `fields.FieldsRecord`, `fields.fieldsToZodObject`, `fields.nullable`, `fields/date/config.dateField`, `fields/float/config.floatField`, `fields/text/config.textField`, `infra/endpoints.defineEndpoint`, `primitives/live-state.resourceDescriptor`
  - Exports: Types: `Song`, `UpdateSongBody`; Values: `deleteSong`, `SongSchema`, `songsResource`, `updateSong`
- Cross-plugin:
  - Imported by: `apps/sonata/playback-history`, `apps/sonata/rich/key-mode`, `apps/sonata/rich/rhythm-controls`, `apps/sonata/sources/chord-grid`, `apps/sonata/sources/midi`, `apps/sonata/sources/midi/folders`, `apps/sonata/sources/ultimate-guitar`, `apps/sonata/track-mixer`, `apps/sonata/transpose`
  - Extended by: `apps/sonata/sources/chord-grid` (table `sonata_songs_ext_chord_grid`), `apps/sonata/rich/key-mode` (table `sonata_songs_ext_key_auto_detect`), `apps/sonata/sources/midi` (table `sonata_songs_ext_midi`), `apps/sonata/playback-history` (table `sonata_songs_ext_playback`), `apps/sonata/rich/rhythm-controls` (table `sonata_songs_ext_rhythm`), `apps/sonata/transpose` (table `sonata_songs_ext_transpose`), `apps/sonata/sources/ultimate-guitar` (table `sonata_songs_ext_ultimate_guitar`)

<!-- AUTOGENERATED:END -->
