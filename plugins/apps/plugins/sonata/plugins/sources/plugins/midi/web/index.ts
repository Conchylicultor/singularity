import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdMusicNote } from "react-icons/md";
import { Sonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { MidiLoader } from "./loader";
import { compile } from "./compile";

export default {
  id: "sonata-sources-midi",
  name: "Sonata: MIDI Source",
  description:
    "MIDI file input source for Sonata. Dropzone accepts .mid/.midi files; compile() parses them into a Score via @tonejs/midi.",
  contributions: [
    Sonata.Source({
      id: "midi",
      label: "MIDI File",
      icon: MdMusicNote,
      LoaderComponent: MidiLoader,
      compile,
    }),
  ],
} satisfies PluginDefinition;
