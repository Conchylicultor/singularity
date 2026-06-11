import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import type { TokenGroupPreset } from "@plugins/ui/plugins/theme-engine/web";
import { ThemeEngine } from "@plugins/ui/plugins/theme-engine/web";
import { useEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { listTweakcnThemes } from "../core";
import { tweakcnBootTask } from "./boot";

export default {
  description:
    "Imports tweakcn themes as dynamic presets across all token groups.",
  contributions: [
    tweakcnBootTask,
    ThemeEngine.PresetSource({
      usePresets: (groupId: string): TokenGroupPreset[] | undefined => {
        // eslint-disable-next-line react-hooks/rules-of-hooks -- called unconditionally by GroupStyle during render
        const { data } = useEndpoint(listTweakcnThemes, {});
        // Still loading (only when the boot-task hydration missed): signal
        // pending rather than reporting an empty final list.
        if (!data) return undefined;
        return data
          .filter((t) => groupId in t.presets)
          .map((t) => ({
            id: `tweakcn:${t.tweakcnId}`,
            label: t.label,
            light: t.presets[groupId]!.light,
            dark: t.presets[groupId]!.dark,
          }));
      },
    }),
  ],
} satisfies PluginDefinition;
