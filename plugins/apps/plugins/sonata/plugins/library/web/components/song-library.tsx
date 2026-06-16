import { useMemo, useState } from "react";
import { useResource, matchResource } from "@plugins/primitives/plugins/live-state/web";
import { SegmentedControl } from "@plugins/primitives/plugins/toggle-chip/web";
import { DataView } from "@plugins/primitives/plugins/data-view/web";
import type { FieldDef } from "@plugins/primitives/plugins/data-view/web";
import { formatRelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import { Text } from "@plugins/primitives/plugins/text/web";
import { useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import { songsResource, updateSong } from "../../core";
import type { Song } from "../../core";
import { Library } from "../slots";
import { useOpenSong } from "../hooks";
import { SongCard, formatDuration } from "./song-card";

/**
 * The Sonata landing surface: the saved-song collection rendered through the
 * `data-view` primitive (gallery of cards + sortable/searchable table). Opening
 * a song hydrates every source that has data for it via the generic
 * `Library.Source` registry (see `useOpenSong`) and switches to the player —
 * the library never names MIDI (or any source). The toolbar renders each
 * source's "add a song" affordance (`Library.Source.AddAction`). The song list
 * is reactive via the live `songsResource`; the gallery view keeps the custom
 * `SongCard` (play affordance + hover-delete) via `viewOptions.gallery.renderCard`.
 *
 * Gallery orderings contributed via `Library.Sort` (e.g. play-based orderings
 * from `playback-history`) still apply: the active ordering produces the row
 * list that feeds `DataView`, and the ordering picker lives in the toolbar.
 */
export function SongLibrary() {
  const songs = useResource(songsResource);
  const openSong = useOpenSong();
  // Write-back for inline cell editing (title / composer) in the table view.
  // Fire-and-forget: the server's `updateSongMeta` pushes the live
  // `songsResource`, so the edited cell settles from server truth; a failed
  // write surfaces via the global mutation toast (no local onError).
  const { mutate: saveSong } = useEndpointMutation(updateSong);
  const sources = Library.Source.useContributions();
  // Active gallery ordering. "newest" is the built-in default (the list already
  // arrives newest-first); extra orderings (e.g. play-based) are contributed to
  // `Library.Sort` by other plugins and dispatched on below.
  const [sort, setSort] = useState<string>("newest");
  const sortContributions = Library.Sort.useContributions();
  const sortOptions = [
    { id: "newest", label: "Newest" },
    ...sortContributions.map((c) => ({ id: c.id, label: c.label })),
  ];

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
    [saveSong],
  );

  // One render path for both states: while loading, DataView renders its
  // skeleton (`loading`) and the chrome (title / search / add actions) stays
  // stable — the "No songs yet" empty state requires confirmed-empty.
  const renderLibrary = (rows: Song[], loading: boolean) => (
    <Library.Sort.Dispatch
      activeSortId={sort}
      songs={rows}
      render={(ordered) => (
        <DataView<Song>
          rows={ordered}
          fields={fields}
          rowKey={(s) => s.id}
          views={["gallery", "table"]}
          defaultView="gallery"
          storageKey="sonata:library"
          title="Library"
          loading={loading}
          actions={
            <>
              {rows.length > 0 ? (
                <SegmentedControl
                  options={sortOptions}
                  value={sort}
                  onChange={setSort}
                  variant="ghost"
                  size="sm"
                />
              ) : null}
              {/* Per-source "add a song" affordances (e.g. MIDI Import). */}
              {sources.map((s) =>
                s.AddAction ? <s.AddAction key={s.sourceId} /> : null,
              )}
            </>
          }
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
      )}
    />
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {songs.error ? (
        <Text as="div" variant="body" tone="destructive" className="px-xl py-lg">
          Failed to load songs: {songs.error.message}
        </Text>
      ) : null}
      {matchResource(songs, {
        pending: () => renderLibrary([], true),
        // The error banner above already covers the failed-load case; keep the
        // (skeleton) chrome underneath it rather than a second error block.
        error: () => renderLibrary([], true),
        ready: (rows) => renderLibrary(rows, false),
      })}
    </div>
  );
}
