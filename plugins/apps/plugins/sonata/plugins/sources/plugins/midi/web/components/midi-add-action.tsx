import { Button } from "@plugins/primitives/plugins/ui-kit/web";
import { useRef, useState } from "react";
import { MdFileUpload } from "react-icons/md";
import { uploadAttachment } from "@plugins/infra/plugins/attachments/web";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { useOpenSong } from "@plugins/apps/plugins/sonata/plugins/library/web";
import { deriveMidiSongMeta } from "../../shared/parse";
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
      // Derive the card metadata client-side. `deriveMidiSongMeta` parses the
      // file and throws loudly on malformed MIDI — we let it propagate.
      const meta = deriveMidiSongMeta(buf, file.name);
      const up = await uploadAttachment(file, file.name, "audio/midi");
      const song = await fetchEndpoint(
        createMidiSong,
        {},
        {
          body: {
            title: meta.title,
            composer: null,
            attachmentId: up.id,
            durationSec: meta.durationSec,
            endBeat: meta.endBeat,
            trackCount: meta.trackCount,
          },
        },
      );
      openSong(song);
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
