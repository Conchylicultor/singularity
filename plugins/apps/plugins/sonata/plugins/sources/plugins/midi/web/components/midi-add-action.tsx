import { useRef, useState } from "react";
import { MdFileUpload } from "react-icons/md";
import { Button } from "@/components/ui/button";
import { uploadAttachment } from "@plugins/infra/plugins/attachments/web";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import {
  beatToSeconds,
  scoreEndBeat,
} from "@plugins/apps/plugins/sonata/plugins/score/core";
import { useOpenSong } from "@plugins/apps/plugins/sonata/plugins/library/web";
import { compile } from "../compile";
import { createMidiSong } from "../../shared/endpoints";

/**
 * The MIDI source's "add a song" affordance, contributed to `Library.Source`
 * and rendered in the library header. Imports a `.mid` file: parse client-side
 * for metadata, upload the bytes, create the MIDI-backed song server-side, then
 * open it immediately (via the generic `useOpenSong`).
 */
export function MidiAddAction() {
  const openSong = useOpenSong();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  async function importFile(file: File) {
    setImporting(true);
    try {
      const buf = await file.arrayBuffer();
      // Parse client-side for the card metadata. `compile` throws loudly on
      // malformed MIDI — we let it propagate.
      const score = compile(buf);
      const endBeat = scoreEndBeat(score);
      const up = await uploadAttachment(file, file.name, "audio/midi");
      const song = await fetchEndpoint(
        createMidiSong,
        {},
        {
          body: {
            title: score.meta.title ?? file.name.replace(/\.midi?$/i, ""),
            composer: null,
            attachmentId: up.id,
            durationSec: beatToSeconds(score, endBeat),
            endBeat,
            trackCount: score.tracks.length,
          },
        },
      );
      await openSong(song);
    } finally {
      setImporting(false);
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        disabled={importing}
        onClick={() => fileInputRef.current?.click()}
      >
        <MdFileUpload className="size-4" />
        {importing ? "Importing…" : "Import"}
      </Button>
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
    </>
  );
}
