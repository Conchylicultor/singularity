import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdMusicNote } from "react-icons/md";
import { Sonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { Library } from "@plugins/apps/plugins/sonata/plugins/library/web";
import { compile } from "./compile";
import { UltimateGuitarLoader } from "./loader";
import { UG_SOURCE_ID } from "./constants";
import { hydrate } from "./hydrate";
import { ultimateGuitarCreateOption } from "./components/ug-create-option";
import { UltimateGuitarEditorSection } from "./components/ug-editor-section";

export default {
  description:
    "Player-side Ultimate Guitar source for Sonata: paste a UG tab URL, fetch its raw tab, and compile() the chord/lyric markup into a playable Score (lyric-proportional, bar-quantized timing synthesis → annotations + voiced notes, sections, lyrics, synthesized 4/4 tempo). Persists the loaded tab to a per-song side-table, hydrates it on open, and contributes the library 'Import from Ultimate Guitar' URL-paste affordance plus an in-player editor section.",
  contributions: [
    Sonata.Source({
      id: UG_SOURCE_ID,
      label: "Ultimate Guitar",
      icon: MdMusicNote,
      LoaderComponent: UltimateGuitarLoader,
      compile,
    }),
    Library.Source({
      sourceId: UG_SOURCE_ID,
      hydrate,
      createOption: ultimateGuitarCreateOption,
    }),
    Sonata.Section({
      id: "ultimate-guitar-editor",
      label: "Ultimate Guitar",
      icon: MdMusicNote,
      component: UltimateGuitarEditorSection,
      area: "editor",
    }),
  ],
} satisfies PluginDefinition;
