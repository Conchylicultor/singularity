import { useContext } from "react";
import { useConfig } from "@plugins/config_v2/web";
import {
  ColorAdjustContext,
  transformValues,
} from "@plugins/ui/plugins/theme-engine/web";
import { sidebarPaletteGroup } from "../../shared";
import { sidebarPaletteConfig } from "../internal/config";
import { SidebarPalette } from "../slots";

const REPRESENTATIVE_KEYS: (keyof typeof sidebarPaletteGroup.schema)[] = [
  "sidebar",
  "sidebarPrimary",
  "sidebarAccent",
  "sidebarBorder",
];

export function SidebarPaletteHeaderDots() {
  const config = useConfig(sidebarPaletteConfig) as {
    preset: string;
    overrides: { light: Record<string, string>; dark: Record<string, string> };
  };
  const presets = SidebarPalette.Preset.useContributions();
  const adjustment = useContext(ColorAdjustContext);

  const active = presets.find((p) => p.id === config.preset) ?? presets[0];
  const overrides = config.overrides;
  const lightOverrideFiltered = Object.fromEntries(
    Object.entries(overrides.light ?? {}).filter(([, v]) => v !== ""),
  );
  const lightValues = active
    ? transformValues(
        { ...active.light, ...lightOverrideFiltered },
        adjustment,
      )
    : {};

  const schema = sidebarPaletteGroup.schema;

  return (
    <span className="flex items-center gap-2xs">
      {REPRESENTATIVE_KEYS.map((key) => (
        <span
          key={key as string}
          className="size-2.5 rounded-full border border-border/30"
          style={{
            backgroundColor: lightValues[key] ?? schema[key]?.default ?? "",
          }}
        />
      ))}
    </span>
  );
}
