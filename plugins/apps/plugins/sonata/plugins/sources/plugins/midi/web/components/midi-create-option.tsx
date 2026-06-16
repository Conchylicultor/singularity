import { MdFileUpload } from "react-icons/md";
import type { CreateOption } from "@plugins/primitives/plugins/data-view/web";
import { uploadAttachment } from "@plugins/infra/plugins/attachments/web";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { openSongImperative } from "@plugins/apps/plugins/sonata/plugins/library/web";
import { deriveMidiSongMeta } from "../../shared/parse";
import { createMidiSong } from "../../shared/endpoints";

/**
 * Pick a single file imperatively (no rendered `<input>`): create a transient
 * file input, click it, and resolve with the chosen file (or `null` if the user
 * cancels). Lets the create affordance live as plain data — `CreateOption` has
 * no component to host a hidden input.
 */
function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = () => {
      resolve(input.files?.[0] ?? null);
    };
    input.click();
  });
}

/**
 * The MIDI source's create affordance, contributed to `Library.Source` and
 * mapped by the library into the data-view `creators` "+" menu. Imports a `.mid`
 * file: pick a file imperatively, parse client-side for metadata, upload the
 * bytes, create the MIDI-backed song server-side, then open it immediately
 * (via the imperative `openSongImperative`). Fully imperative — no React hooks.
 */
export const midiCreateOption: CreateOption = {
  id: "midi",
  label: "Import MIDI",
  icon: <MdFileUpload className="size-4" />,
  onSelect: async () => {
    const file = await pickFile(".mid,.midi");
    if (!file) return;
    const buf = await file.arrayBuffer();
    // Derive the card metadata client-side. `deriveMidiSongMeta` parses the file
    // and throws loudly on malformed MIDI — we let it propagate.
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
    openSongImperative(song);
  },
};
