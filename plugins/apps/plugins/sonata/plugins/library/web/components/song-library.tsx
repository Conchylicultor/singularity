import { useMemo, useState } from "react";
import { uploadAttachment } from "@plugins/infra/plugins/attachments/web";
import { attachmentUrl } from "@plugins/primitives/plugins/text-editor/plugins/paste-images/core";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { SegmentedControl } from "@plugins/primitives/plugins/toggle-chip/web";
import { DataView } from "@plugins/primitives/plugins/data-view/web";
import type { FieldDef } from "@plugins/primitives/plugins/data-view/web";
import { formatRelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import {
  beatToSeconds,
  scoreEndBeat,
} from "@plugins/apps/plugins/sonata/plugins/score/core";
import { useSonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import {
  compile,
  MIDI_SOURCE_ID,
} from "@plugins/apps/plugins/sonata/plugins/sources/plugins/midi/web";
import { createSong, songsResource } from "../../core";
import type { Song } from "../../core";
import { Library } from "../slots";
import { SongCard, formatDuration } from "./song-card";
import { ImportButton } from "./import-button";

/**
 * The Sonata landing surface: the saved-song collection rendered through the
 * `data-view` primitive (gallery of cards + sortable/searchable table). Clicking
 * a row hydrates the MIDI source with the song's stored bytes and switches the
 * shell to the player. The Import toolbar action saves a dropped `.mid` file
 * (upload → create → open). The song list is reactive via the live
 * `songsResource`; the gallery view keeps the custom `SongCard` (play affordance
 * + hover-delete) via `viewOptions.gallery.renderCard`.
 *
 * Gallery orderings contributed via `Library.Sort` (e.g. play-based orderings
 * from `playback-history`) still apply: the active ordering produces the row
 * list that feeds `DataView`, and the ordering picker lives in the toolbar.
 */
export function SongLibrary() {
  const songs = useResource(songsResource);
  const { setRawMap, openPlayer } = useSonata();
  const [importing, setImporting] = useState(false);
  // Active gallery ordering. "newest" is the built-in default (the list already
  // arrives newest-first); extra orderings (e.g. play-based) are contributed to
  // `Library.Sort` by other plugins and dispatched on below.
  const [sort, setSort] = useState<string>("newest");
  const sortContributions = Library.Sort.useContributions();
  const sortOptions = [
    { id: "newest", label: "Newest" },
    ...sortContributions.map((c) => ({ id: c.id, label: c.label })),
  ];

  async function open(song: Song) {
    // Fetch the stored MIDI bytes and hand them to the MIDI source, then enter
    // the player. `setRawMap` is source-agnostic so it doesn't disturb the
    // active-source picker.
    const res = await fetch(attachmentUrl(song.midiAttachmentId));
    if (!res.ok) {
      throw new Error(
        `Failed to load MIDI for "${song.title}" (${res.status})`,
      );
    }
    const buf = await res.arrayBuffer();
    setRawMap({ [MIDI_SOURCE_ID]: buf });
    openPlayer({ id: song.id, title: song.title });
  }

  async function importFile(file: File) {
    setImporting(true);
    try {
      const buf = await file.arrayBuffer();
      // Parse client-side for the card metadata (title + length). `compile`
      // throws loudly on malformed MIDI — we let it propagate.
      const score = compile(buf);
      const endBeat = scoreEndBeat(score);
      const up = await uploadAttachment(file, file.name, "audio/midi");
      const song = await fetchEndpoint(
        createSong,
        {},
        {
          body: {
            title: score.meta.title ?? file.name.replace(/\.midi?$/i, ""),
            composer: null,
            attachmentId: up.id,
            durationSec: beatToSeconds(score, endBeat),
            endBeat,
            midiTrackCount: score.tracks.length,
          },
        },
      );
      await open(song);
    } finally {
      setImporting(false);
    }
  }

  const fields: FieldDef<Song>[] = useMemo(
    () => [
      {
        id: "title",
        label: "Title",
        type: "text",
        value: (s) => s.title,
        sortable: true,
        filterable: true,
      },
      {
        id: "composer",
        label: "Composer",
        type: "text",
        value: (s) => s.composer ?? "Unknown",
        sortable: true,
        filterable: true,
      },
      {
        id: "duration",
        label: "Length",
        type: "number",
        value: (s) => s.durationSec,
        cell: (s) => formatDuration(s.durationSec),
        sortable: true,
        width: "w-20",
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
      },
    ],
    [],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {songs.error ? (
        <div className="px-6 py-4 text-sm text-destructive">
          Failed to load songs: {songs.error.message}
        </div>
      ) : null}
      <Library.Sort.Dispatch
        activeSortId={sort}
        songs={songs.pending ? [] : songs.data}
        render={(ordered) => (
          <DataView<Song>
            rows={ordered}
            fields={fields}
            rowKey={(s) => s.id}
            views={["gallery", "table"]}
            defaultView="gallery"
            storageKey="sonata:library"
            title="Library"
            actions={
              <>
                {!songs.pending && songs.data.length > 0 ? (
                  <SegmentedControl
                    options={sortOptions}
                    value={sort}
                    onChange={setSort}
                    variant="ghost"
                    size="sm"
                  />
                ) : null}
                <ImportButton
                  importing={importing}
                  onPick={(f) => void importFile(f)}
                />
              </>
            }
            onRowActivate={(s) => void open(s)}
            emptyState={<>No songs yet — import a MIDI file to get started.</>}
            viewOptions={{
              gallery: {
                renderCard: (s: Song) => (
                  <SongCard song={s} onOpen={(x) => void open(x)} />
                ),
              },
            }}
          />
        )}
      />
    </div>
  );
}
