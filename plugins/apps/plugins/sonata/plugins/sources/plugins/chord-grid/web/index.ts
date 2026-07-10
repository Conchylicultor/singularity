import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdGridView } from "react-icons/md";
import { Sonata, useSonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { Library } from "@plugins/apps/plugins/sonata/plugins/library/web";
import { compile } from "./compile";
import { ChordGridLoader } from "./loader";
import { CHORD_GRID_SOURCE_ID } from "./constants";
import { hydrate } from "./hydrate";
import { chordGridCreateOption } from "./components/chord-grid-create-option";
import { ChordGridEditorSection } from "./components/chord-grid-editor-section";
import { ChordGridPersistObserver } from "./components/chord-grid-persist-observer";

export default {
  description:
    "Chord-grid input source for Sonata. A small mini-language (e.g. `Amaj9 Am9 (E E6)`) authors chord annotations: each cell is a bar, a `( )` group shares a bar, and `.` holds the previous chord. A cell may name a chord by letter (`Am7`) or by degree (`vi7`), the latter resolved against the key a `key:` directive declares. compile() emits chord + key annotations only; the shell's reactive re-voicing step generates the notes under the global voicing config. Persists per-song grid text and contributes the library 'New Chord Grid' affordance, hydration, and an in-player editor section.",
  contributions: [
    Sonata.Source({
      id: CHORD_GRID_SOURCE_ID,
      label: "Chord Grid",
      icon: MdGridView,
      LoaderComponent: ChordGridLoader,
      compile,
    }),
    Library.Source({
      sourceId: CHORD_GRID_SOURCE_ID,
      hydrate,
      createOption: chordGridCreateOption,
    }),
    Sonata.Section({
      id: "chord-grid-editor",
      label: "Chord Grid",
      icon: MdGridView,
      component: ChordGridEditorSection,
      area: "editor",
      useAvailable: () =>
        useSonata().sourceRaw(CHORD_GRID_SOURCE_ID) !== undefined,
    }),
    Sonata.Effect({
      id: "chord-grid-persist",
      component: ChordGridPersistObserver,
    }),
  ],
} satisfies PluginDefinition;
