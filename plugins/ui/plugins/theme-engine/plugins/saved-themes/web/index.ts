import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ThemeEngine } from "@plugins/ui/plugins/theme-engine/web";
import { savedThemesBootTask } from "./boot";
import { useSavedThemes } from "./internal/use-saved-themes";

export { useEditTheme } from "./use-edit-theme";
export { refreshSavedThemes } from "./refresh-saved-themes";
export { removeSavedTheme } from "./remove-saved-theme";
export type { RemoveSavedThemeResult } from "./remove-saved-theme";
export type { ThemeEdits } from "./use-edit-theme";

export default {
  description:
    "Saved themes (tweakcn imports and custom themes) as a resident theme source, hydrated before first paint, plus useEditTheme — the one place theme edits land, copying a read-only theme into a custom one on first edit.",
  contributions: [
    savedThemesBootTask,
    ThemeEngine.ThemeSource({
      kind: "resident",
      id: "saved",
      useThemes: useSavedThemes,
    }),
  ],
} satisfies PluginDefinition;
