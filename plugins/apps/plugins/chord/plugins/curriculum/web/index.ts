import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export {
  useCatalog,
  useCurriculum,
  useCurriculumWrites,
} from "./internal/use-curriculum";
export type { CurriculumWrites } from "./internal/use-curriculum";
export { ChordsSection } from "./components/chords-section";
export type { ChipStanding, StandingLookup } from "./components/chords-section";

export default {
  description:
    "The curriculum's browser half: useCurriculum (the live chord.curriculum selection — each chord practised, heard or off, the blanks, how many other chords a loop may hold), useCatalog (the live chord.catalog), useCurriculumWrites (chords, blanks, extras; refusals as toasts), and <ChordsSection> — the trainer side panel's collapsible Chords section: Clear / Undo clear, the Blanks and Other-chords-per-loop pills, and every chord of the song index in tracks and sections, each chip cycling off → hear → practise, one chip per section's rare chords, and a footer giving the exact numbers of the chip under the pointer.",
  contributions: [],
} satisfies PluginDefinition;
