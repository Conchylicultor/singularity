import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import type { TokenGroupPreset } from "@plugins/ui/plugins/theme-engine/web";
import { ThemeEngine } from "@plugins/ui/plugins/theme-engine/web";
import { ThemeCustomizer } from "@plugins/ui/plugins/theme-engine/plugins/theme-customizer/web";
import { useEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { listTweakcnThemes } from "../core";
import { TweakcnSection } from "./components/tweakcn-section";

export default {
  id: "ui-tweakcn",
  name: "UI: Tweakcn",
  description:
    "Imports tweakcn themes as dynamic presets across all token groups.",
  contributions: [
    ThemeEngine.PresetSource({
      usePresets: (groupId: string): TokenGroupPreset[] => {
        // eslint-disable-next-line react-hooks/rules-of-hooks -- called unconditionally by GroupStyle during render
        const { data } = useEndpoint(listTweakcnThemes, {});
        if (!data) return [];
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
    ThemeCustomizer.Section({
      id: "tweakcn",
      label: "Import from tweakcn",
      component: TweakcnSection,
    }),
  ],
} satisfies PluginDefinition;
