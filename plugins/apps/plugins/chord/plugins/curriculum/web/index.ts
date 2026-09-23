import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { useCurriculum, useCurriculumWrites } from "./internal/use-curriculum";
export type { CurriculumWrites } from "./internal/use-curriculum";
export { PathCard, BlanksGlyph } from "./components/path-card";
export type { StandingLookup } from "./components/path-card";
export { PathProgress } from "./components/path-progress";

export default {
  description:
    "The curriculum's browser half: useCurriculum (the live chord.curriculum selection — each chord practised, heard or off, the blanks, the key modes), useCurriculumWrites (its four writes, refusals as toasts), <PathCard> — the folded card holding every practice control: the chord chips, the blanks, where the path goes next, and each chapter's map — and <PathProgress>, the step bar of the chapter in hand.",
  contributions: [],
} satisfies PluginDefinition;
