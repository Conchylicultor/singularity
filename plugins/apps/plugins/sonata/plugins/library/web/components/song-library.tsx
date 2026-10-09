import { useMemo } from "react";
import { useLive } from "@plugins/network/plugins/live/web";
import { foldResource } from "@plugins/primitives/plugins/live-state/web";
import {
  DataView,
  defineDataView,
} from "@plugins/primitives/plugins/data-view/web";
import type {
  CreateOption,
  FieldDef,
} from "@plugins/primitives/plugins/data-view/web";
import { formatRelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import { Column } from "@plugins/primitives/plugins/css/plugins/column/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import { SonataDocument } from "@plugins/apps/plugins/sonata/plugins/document/web";
import { useSonataApp } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { songLibrary, updateSong } from "../../core";
import type { Song } from "../../core";
import { Library } from "../slots";
import { useSongLink } from "../hooks";
import { songLibrarySource } from "../source";
import { formatDuration } from "../format-duration";
import { NowPlayingBar } from "./now-playing-bar";
import { SonataOnboarding } from "./onboarding";
import { symbol } from "@plugins/ui/plugins/icons/core";
import { Icon } from "@plugins/ui/plugins/icons/web";

const musicNoteIcon = symbol("music-note");

const LIBRARY_VIEW = defineDataView("sonata.library");

/**
 * The Sonata landing surface: the saved-song collection rendered through the
 * `data-view` primitive (gallery of cards + sortable/searchable table). Opening
 * a song hydrates every source that has data for it via the generic
 * `Library.Source` registry (see `useSongLink`) and switches to the player —
 * the library never names MIDI (or any source). Each source's create affordance
 * (`Library.Source.createOption`, a data-view `CreateOption`) is mapped into the
 * DataView's `creators` — rendered as a toolbar "+" menu (N sources). The list
 * reads the live `songLibrary` collection as a segmented scroll
 * (`source={songLibrarySource}`): sort, filter and search run on the server,
 * and every loaded song stays live.
 *
 * There is no bespoke card: the gallery builds the standard `DataCard` from this
 * schema, plus a `leading` music-note block. Everything the old `SongCard` drew
 * is now declared once and honoured by BOTH views — Play/Delete as
 * `Library.SongActions` contributions, the currently-loaded ring as
 * `selectedRowId`, and opening a song as `rowActivation` (a link).
 *
 * Extra fields (e.g. play-count / last-played from `playback-history`) are
 * injected via the `Library.Fields` extension factory passed as
 * `fieldExtensions` — each binds one of its plugin's contributed columns, so it
 * appears in the Sort pill, the Filter pill, and as a table column, sorted and
 * filtered on the server; prerecorded orderings are just named sort presets
 * (authored in config) over those fields rather than bespoke toolbar chips.
 */
export function SongLibrary() {
  // Does the library hold any song at all? One row answers it — the first-run
  // onboarding replaces the list only once that is known to be none.
  const anySong = useLive(songLibrary, { limit: 1 });
  const confirmedEmpty = foldResource(anySong, {
    loading: () => false,
    error: () => false,
    ready: (rows) => rows.length === 0,
  });
  const songLink = useSongLink();
  // The background-playing song (if any) — highlights its table row and feeds
  // the now-playing footer below.
  const { currentSongId } = useSonataApp();
  // Write-back for inline cell editing (title / composer) in the table view.
  // Fire-and-forget: the server's `updateSongMeta` write refills that song in
  // the live collection, so the edited cell settles from server truth; a failed
  // write surfaces via the global mutation toast (no local onError).
  const { mutate: saveSong } = useEndpointMutation(updateSong);
  const sources = Library.Source.useContributions();
  // The player-side source registry carries each source's human label + icon
  // (the `Library.Source` registry above is id-only). Its ids match the opaque
  // `source` stamped on each song, so it doubles as the "Source" column's option
  // set — the library never hard-codes a source name.
  const sonataSources = SonataDocument.Source.useContributions();
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
        // Project the raw nullable value (not a placeholder) so the inline
        // editor opens from the true value and clearing it stores `null`.
        // No `cell`: the field is editable, so `EditableCell` owns the empty
        // rendering and paints its own italic "Empty" hint — which is the
        // affordance (it invites the edit) where the old card's flat "Unknown"
        // was not. Both views read the same.
        value: (s) => s.composer,
        onEdit: (s, next) => {
          const composer = String(next ?? "").trim();
          saveSong({
            params: { id: s.id },
            body: { composer: composer || null },
          });
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
        column: songLibrary.column("durationSec"),
        width: "5rem",
        align: "end",
      },
      {
        id: "added",
        label: "Added",
        type: "date",
        // `createdAt` is a Date on the wire; the `date` type sorts on it
        // directly, rendered as a relative "Nd ago" label.
        value: (s) => s.createdAt,
        cell: (s) => formatRelativeTime(s.createdAt),
        sortable: true,
        column: songLibrary.column("createdAt"),
        width: "7rem",
      },
    ],
    [saveSong, sourceOptions],
  );

  return (
    <Column
      fill
      className="h-full"
      body={
        // Confirmed-empty (ready, no song) → the first-run onboarding
        // takeover (hero + source cards). Anything else → the DataView, which
        // owns its loading skeleton and its errors: a loading or failed
        // library never flashes the onboarding.
        confirmedEmpty ? (
          <SonataOnboarding />
        ) : (
          <DataView<Song>
            source={songLibrarySource}
            fields={fields}
            fieldExtensions={Library.Fields}
            views={["gallery", "table"]}
            defaultView="gallery"
            storageKey={LIBRARY_VIEW}
            // The one per-row action set, rendered by both views: Play/Pause
            // at rest (zone "persistent") and Delete on hover. Highlight the
            // background-playing row.
            itemActions={Library.SongActions}
            selectedRowId={currentSongId ?? undefined}
            // The "Library" title is owned by the enclosing `PaneChrome` (the
            // pane header), so the DataView omits its own to avoid a duplicate.
            // Per-source create affordances (e.g. MIDI Import, New Chord Grid),
            // mapped from the `Library.Source` registry into the data-view "+"
            // menu. The library stays source-agnostic — it threads an opaque
            // `createOption` and never names MIDI.
            creators={sources
              .map((s) => s.createOption)
              .filter((c): c is CreateOption => Boolean(c))}
            rowActivation={songLink}
            emptyState={<>No songs match.</>}
            viewOptions={{
              gallery: {
                // The card's identity block, beside the body — the one piece of
                // the old SongCard that was a real gap in the generic card.
                leading: () => (
                  <Center className="size-10 rounded-md bg-primary/10 text-primary-text">
                    <Icon icon={musicNoteIcon} className="size-5" />
                  </Center>
                ),
              },
            }}
          />
        )
      }
      footer={<NowPlayingBar />}
    />
  );
}
