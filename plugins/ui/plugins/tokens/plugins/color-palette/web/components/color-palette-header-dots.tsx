import { useContext } from "react";
import { useConfigValues } from "@plugins/config/web";
import {
  ColorAdjustContext,
  transformValues,
} from "@plugins/ui/plugins/theme-engine/web";
import { colorPaletteGroup } from "../../shared";
import { colorPaletteConfig } from "../internal/config";
import { ColorPalette } from "../slots";

const PLUGIN_ID = "ui-tokens-color-palette";

const REPRESENTATIVE_KEYS: (keyof typeof colorPaletteGroup.schema)[] = [
  "primary",
  "secondary",
  "accent",
  "background",
  "card",
  "popover",
  "muted",
  "destructive",
  "border",
];

export function ColorPaletteHeaderDots() {
  const config = useConfigValues(colorPaletteConfig, PLUGIN_ID);
  const presets = ColorPalette.Preset.useContributions();
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

  const schema = colorPaletteGroup.schema;

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
