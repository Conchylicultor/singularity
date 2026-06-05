import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdMusicNote } from "react-icons/md";
import { Sonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { MidiLoader } from "./loader";
import { compile } from "./compile";
import { MIDI_SOURCE_ID } from "./constants";

// Re-export the source id and `compile` so consumers (the library) can
// reference the id and parse a song's MIDI bytes for card metadata without
// depending on the source's internal file layout.
export { MIDI_SOURCE_ID };
export { compile };

export default {
  name: "Sonata: MIDI Source",
  description:
    "MIDI file input source for Sonata. Dropzone accepts .mid/.midi files; compile() parses them into a Score via @tonejs/midi.",
  contributions: [
    Sonata.Source({
      id: MIDI_SOURCE_ID,
      label: "MIDI File",
      icon: MdMusicNote,
      LoaderComponent: MidiLoader,
      compile,
    }),
  ],
} satisfies PluginDefinition;
