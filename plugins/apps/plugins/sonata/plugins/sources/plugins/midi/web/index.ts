import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdMusicNote } from "react-icons/md";
import { Sonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { Library } from "@plugins/apps/plugins/sonata/plugins/library/web";
import { MidiLoader } from "./loader";
import { parseMidi } from "../shared/parse";
import { MIDI_SOURCE_ID } from "./constants";
import { hydrate } from "./hydrate";
import { MidiAddAction } from "./components/midi-add-action";
import { MidiCardMeta } from "./components/midi-card-meta";

// Re-export the source id so consumers can identify this source without
// depending on its internal layout.
export { MIDI_SOURCE_ID };
export { useSongMidi } from "./hooks";

export default {
  description:
    "MIDI file input source for Sonata. Dropzone accepts .mid/.midi files; compile() parses them into a Score via @tonejs/midi. Persists per-song MIDI (attachment + track count) and contributes the library Import affordance, hydration, and card track count.",
  contributions: [
    Sonata.Source({
      id: MIDI_SOURCE_ID,
      label: "MIDI File",
      icon: MdMusicNote,
      LoaderComponent: MidiLoader,
      compile: parseMidi,
    }),
    Library.Source({ sourceId: MIDI_SOURCE_ID, hydrate, AddAction: MidiAddAction }),
    Library.CardMeta({ id: "midi-track-count", component: MidiCardMeta }),
  ],
} satisfies PluginDefinition;
