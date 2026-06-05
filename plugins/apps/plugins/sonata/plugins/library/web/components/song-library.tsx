import { useRef, useState } from "react";
import { MdFileUpload } from "react-icons/md";
import { cn } from "@/lib/utils";
import { uploadAttachment } from "@plugins/infra/plugins/attachments/web";
import { attachmentUrl } from "@plugins/primitives/plugins/text-editor/plugins/paste-images/core";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { SegmentedControl } from "@plugins/primitives/plugins/toggle-chip/web";
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
import { SongCard } from "./song-card";

/**
 * The Sonata landing surface: a gallery of saved songs. Clicking a card hydrates
 * the MIDI source with the song's stored bytes and switches the shell to the
 * player. The Import button saves a dropped `.mid` file (upload → create →
 * open). The song list is reactive via the live `songsResource`.
 */
export function SongLibrary() {
  const songs = useResource(songsResource);
  const { setRawMap, openPlayer } = useSonata();
  const fileInputRef = useRef<HTMLInputElement>(null);
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

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <header className="flex items-center justify-between gap-3 border-b border-border px-6 py-4">
        <h1 className="text-lg font-semibold text-foreground">Library</h1>
        <div className="flex items-center gap-3">
          {!songs.pending && songs.data.length > 0 ? (
            <SegmentedControl
              options={sortOptions}
              value={sort}
              onChange={setSort}
              variant="ghost"
              size="sm"
            />
          ) : null}
          <button
            type="button"
            disabled={importing}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium",
              "text-foreground transition-colors hover:bg-muted/50",
              "disabled:cursor-not-allowed disabled:opacity-60",
            )}
          >
            <MdFileUpload className="size-4" />
            {importing ? "Importing…" : "Import"}
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".mid,.midi"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            // Reset so re-selecting the same file fires onChange again.
            e.target.value = "";
            if (file) void importFile(file);
          }}
        />
      </header>

      {songs.error ? (
        <div className="px-6 py-4 text-sm text-destructive">
          Failed to load songs: {songs.error.message}
        </div>
      ) : null}

      {!songs.pending && songs.data.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-6 text-sm text-muted-foreground">
          No songs yet — import a MIDI file to get started.
        </div>
      ) : (
        <Library.Sort.Dispatch
          activeSortId={sort}
          songs={songs.pending ? [] : songs.data}
          render={(ordered) => (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4 p-6">
              {ordered.map((song) => (
                <SongCard key={song.id} song={song} onOpen={(s) => void open(s)} />
              ))}
            </div>
          )}
        />
      )}
    </div>
  );
}
