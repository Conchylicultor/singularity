import { useContext } from "react";
import { useConfigValues } from "@plugins/config/web";
import {
  ColorAdjustContext,
  transformValues,
} from "@plugins/ui/plugins/theme-engine/web";
import { sidebarPaletteGroup } from "../../shared";
import { sidebarPaletteConfig } from "../internal/config";
import { SidebarPalette } from "../slots";

const PLUGIN_ID = "ui-tokens-sidebar-palette";

const REPRESENTATIVE_KEYS: (keyof typeof sidebarPaletteGroup.schema)[] = [
  "sidebar",
  "sidebarPrimary",
  "sidebarAccent",
  "sidebarBorder",
];

export function SidebarPaletteHeaderDots() {
  const config = useConfigValues(sidebarPaletteConfig, PLUGIN_ID);
  const presets = SidebarPalette.Preset.useContributions();
  const adjustment = useContext(ColorAdjustContext);

  const active = presets.find((p) => p.id === config.preset) ?? presets[0];
  const overrides = JSON.parse((config.overrides as string) || "{}") as {
    light?: Record<string, string>;
    dark?: Record<string, string>;
  };
  const lightValues = active
    ? transformValues(
        { ...active.light, ...(overrides.light ?? {}) },
        adjustment,
      )
    : {};

  const schema = sidebarPaletteGroup.schema;

  return (
    <span className="flex items-center gap-0.5">
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
