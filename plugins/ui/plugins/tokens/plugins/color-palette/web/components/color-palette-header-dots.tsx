import { useContext } from "react";
import { useConfig } from "@plugins/config_v2/web";
import {
  ColorAdjustContext,
  transformValues,
} from "@plugins/ui/plugins/theme-engine/web";
import { colorPaletteGroup } from "../../shared";
import { colorPaletteConfig } from "../internal/config";
import { ColorPalette } from "../slots";

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
  const config = useConfig(colorPaletteConfig);
  const presets = ColorPalette.Preset.useContributions();
  const adjustment = useContext(ColorAdjustContext);

  const active = presets.find((p) => p.id === config.preset) ?? presets[0];
  const ov = config.overrides as {
    light: Record<string, string>;
    dark: Record<string, string>;
  };
  const lightOverrides = Object.fromEntries(
    Object.entries(ov.light).filter(([, v]) => v !== ""),
  );
  const lightValues = active
    ? transformValues({ ...active.light, ...lightOverrides }, adjustment)
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
