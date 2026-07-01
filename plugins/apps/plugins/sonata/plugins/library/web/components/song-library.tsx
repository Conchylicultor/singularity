import { useMemo } from "react";
import { useResource, matchResource } from "@plugins/primitives/plugins/live-state/web";
import { DataView, defineDataView } from "@plugins/primitives/plugins/data-view/web";
import type { CreateOption, FieldDef } from "@plugins/primitives/plugins/data-view/web";
import { formatRelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Column } from "@plugins/primitives/plugins/css/plugins/column/web";
import { useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import { Sonata, useSonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { songsResource, updateSong } from "../../core";
import type { Song } from "../../core";
import { Library } from "../slots";
import { useOpenSong } from "../hooks";
import { SongCard, formatDuration } from "./song-card";
import { NowPlayingBar } from "./now-playing-bar";
import { SonataOnboarding } from "./onboarding";

const LIBRARY_VIEW = defineDataView("sonata.library");

/**
 * The Sonata landing surface: the saved-song collection rendered through the
 * `data-view` primitive (gallery of cards + sortable/searchable table). Opening
 * a song hydrates every source that has data for it via the generic
 * `Library.Source` registry (see `useOpenSong`) and switches to the player —
 * the library never names MIDI (or any source). Each source's create affordance
 * (`Library.Source.createOption`, a data-view `CreateOption`) is mapped into the
 * DataView's `creators` — rendered as a toolbar "+" menu (N sources). The song
 * list is reactive via the live `songsResource`; the gallery view keeps the custom
 * `SongCard` (play affordance + hover-delete) via `viewOptions.gallery.renderCard`.
 *
 * Extra fields (e.g. play-count / last-played from `playback-history`) are
 * injected via the `Library.Fields` extension factory passed as
 * `fieldExtensions` — they appear in the Sort pill, the Filter pill, and as
 * table columns for free, so prerecorded orderings are just named sort presets
 * (authored in config) over those fields rather than bespoke toolbar chips.
 */
export function SongLibrary() {
  const songs = useResource(songsResource);
  const openSong = useOpenSong();
  // The background-playing song (if any) — highlights its table row and feeds
  // the now-playing footer below.
  const { currentSongId } = useSonata();
  // Write-back for inline cell editing (title / composer) in the table view.
  // Fire-and-forget: the server's `updateSongMeta` pushes the live
  // `songsResource`, so the edited cell settles from server truth; a failed
  // write surfaces via the global mutation toast (no local onError).
  const { mutate: saveSong } = useEndpointMutation(updateSong);
  const sources = Library.Source.useContributions();
  // The player-side source registry carries each source's human label + icon
  // (the `Library.Source` registry above is id-only). Its ids match the opaque
  // `source` stamped on each song, so it doubles as the "Source" column's option
  // set — the library never hard-codes a source name.
  const sonataSources = Sonata.Source.useContributions();
  const sourceOptions = useMemo(
    () => sonataSources.map((s) => ({ value: s.id, label: s.label })),
    [sonataSources],
  );

  const fields: FieldDef<Song>[] = useMemo(
    () => [
      {
        id: "title",
        label: "Title",
        type: "text",
        value: (s) => s.title,
        // Title is NOT NULL — ignore a cleared cell so it reverts to the
        // current value rather than persisting an empty string.
        onEdit: (s, next) => {
          const title = String(next ?? "").trim();
          if (!title) return;
          saveSong({ params: { id: s.id }, body: { title } });
        },
        sortable: true,
        filterable: true,
        width: "minmax(0,2fr)",
      },
      {
        id: "composer",
        label: "Composer",
        type: "text",
        // Project the raw nullable value (not the "Unknown" placeholder) so the
        // inline editor opens from the true value and an empty cell reads as
        // empty; clearing it stores `null`. The gallery card keeps its own
        // "Unknown" fallback.
        value: (s) => s.composer,
        onEdit: (s, next) => {
          const composer = String(next ?? "").trim();
          saveSong({ params: { id: s.id }, body: { composer: composer || null } });
        },
        sortable: true,
        filterable: true,
        width: "minmax(0,1fr)",
      },
      {
        id: "source",
        label: "Source",
        // The opaque per-song source id, rendered as a muted tag via the enum
        // field type (labels resolved from `sourceOptions`, i.e. the source
        // registry). Read-only: a song's source is immutable, so no `onEdit`.
        type: "enum",
        options: sourceOptions,
        value: (s) => s.source,
        sortable: true,
        filterable: true,
        width: "8rem",
      },
      {
        id: "duration",
        label: "Length",
        // `int` derives its data-view cell + filter from `number` via the
        // fields `extends` chain (int → number); the explicit `cell` below is the
        // tier-1 override (m:ss), so the inherited number cell is bypassed while
        // the inherited number range filter still applies in the filter bar.
        type: "int",
        value: (s) => s.durationSec,
        cell: (s) => formatDuration(s.durationSec),
        sortable: true,
        width: "5rem",
        align: "end",
      },
      {
        id: "added",
        label: "Added",
        type: "date",
        // `createdAt` is an ISO string; wrap in a Date so the `date` type sorts
        // correctly, and render it as a relative "Nd ago" label.
        value: (s) => new Date(s.createdAt),
        cell: (s) => formatRelativeTime(new Date(s.createdAt)),
        sortable: true,
        width: "7rem",
      },
    ],
    [saveSong, sourceOptions],
  );

  // One render path for both states: while loading, DataView renders its
  // skeleton (`loading`) and the chrome (title / search / add actions) stays
  // stable — the "No songs yet" empty state requires confirmed-empty.
  const renderLibrary = (rows: Song[], loading: boolean) => (
    <DataView<Song>
      rows={rows}
      fields={fields}
      fieldExtensions={Library.Fields}
      rowKey={(s) => s.id}
      views={["gallery", "table"]}
      defaultView="gallery"
      storageKey={LIBRARY_VIEW}
      // Trailing per-row Play/Pause action (table view); the gallery uses its
      // own SongCard button. Highlight the background-playing row.
      itemActions={Library.SongActions}
      selectedRowId={currentSongId ?? undefined}
      // The "Library" title is owned by the enclosing `PaneChrome` (the pane
      // header), so the DataView omits its own to avoid a duplicate.
      loading={loading}
      // Per-source create affordances (e.g. MIDI Import, New Chord Grid),
      // mapped from the `Library.Source` registry into the data-view "+"
      // menu. The library stays source-agnostic — it threads an opaque
      // `createOption` and never names MIDI.
      creators={sources
        .map((s) => s.createOption)
        .filter((c): c is CreateOption => Boolean(c))}
      onRowActivate={(s) => void openSong(s)}
      emptyState={<>No songs yet — add one to get started.</>}
      viewOptions={{
        gallery: {
          renderCard: (s: Song) => (
            <SongCard song={s} onOpen={(x) => void openSong(x)} />
          ),
        },
      }}
    />
  );

  return (
    <Column
      fill
      className="h-full"
      header={
        songs.error ? (
          <Text as="div" variant="body" tone="destructive" className="px-xl py-lg">
            Failed to load songs: {songs.error.message}
          </Text>
        ) : null
      }
      body={matchResource(songs, {
        pending: () => renderLibrary([], true),
        // The error banner above already covers the failed-load case; keep the
        // (skeleton) chrome underneath it rather than a second error block.
        error: () => renderLibrary([], true),
        // Confirmed-empty (ready + 0 rows) → the first-run onboarding takeover
        // (hero + source cards). Any songs → the DataView. Keeping onboarding to
        // the ready-empty case means pending/error still show the DataView
        // skeleton, never a flash of the empty state.
        ready: (rows) =>
          rows.length === 0 ? <SonataOnboarding /> : renderLibrary(rows, false),
      })}
      footer={<NowPlayingBar />}
    />
  );
}
