import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Apps } from "@plugins/apps-core/web";
import { mdAppIcon } from "@plugins/apps-core/plugins/app-icon/web";
import { ThemeEngine } from "@plugins/ui/plugins/theme-engine/web";
import { MdQueueMusic } from "react-icons/md";
import { chordApp } from "../core";
import { ChordLayout } from "./components/chord-layout";
import { chordTheme } from "./internal/theme";

export default {
  description:
    "The Chord app's rail entry and frame: a thin header (the three-bar logo and the name) above the full-pane renderer, where the trainer's pane is shown, and the app's own dark-only theme (the mockup's onyx blacks, the seven chord colours as categorical-1…7, Schibsted Grotesk and Bodoni Moda), which the chord app selects.",
  contributions: [
    Apps.App({
      app: chordApp,
      icon: mdAppIcon(MdQueueMusic),
      component: ChordLayout,
    }),
    // Selected for the chord app in `config/ui/theme-engine/@app/chord/theme.jsonc`.
    ThemeEngine.Theme(chordTheme),
  ],
} satisfies PluginDefinition;
