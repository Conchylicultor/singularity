import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdMusicNote } from "react-icons/md";
import { Sonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { compile } from "./compile";
import { UltimateGuitarLoader } from "./loader";
import { UG_SOURCE_ID } from "./constants";
import { UltimateGuitarEditorSection } from "./components/ug-editor-section";

export default {
  description:
    "Player-side Ultimate Guitar source for Sonata: paste a UG tab URL, fetch its raw tab, and compile() the chord/lyric markup into a playable Score (chord-per-bar timing synthesis → annotations + voiced notes, sections, lyrics, synthesized 4/4 tempo). Contributes the Sonata.Source registration and an in-player editor section. Library persistence + the create affordance + hydration are a later task.",
  contributions: [
    Sonata.Source({
      id: UG_SOURCE_ID,
      label: "Ultimate Guitar",
      icon: MdMusicNote,
      LoaderComponent: UltimateGuitarLoader,
      compile,
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
