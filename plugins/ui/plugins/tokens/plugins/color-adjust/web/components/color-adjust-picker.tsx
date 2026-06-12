import { useConfig, useSetConfig } from "@plugins/config_v2/web";
import { Stack } from "@plugins/primitives/plugins/spacing/web";
import { useThemeScopeId } from "@plugins/ui/plugins/theme-engine/web";
import { colorAdjustConfig } from "../internal/config";
import { ColorAdjust } from "../slots";

export function ColorAdjustPicker() {
  const scopeId = useThemeScopeId();
  const presets = ColorAdjust.Preset.useContributions();
  const config = useConfig(colorAdjustConfig, { scopeId });
  const setConfig = useSetConfig(colorAdjustConfig, { scopeId });
  const activeId = config.preset;
  const hueShift = config.hueShift;
  const saturationScale = config.saturationScale;
  const lightnessScale = config.lightnessScale;

  return (
    <Stack gap="md">
      <Stack direction="row" gap="xs" wrap>
        {presets.map((p) => (
          <button
            key={p.id}
            className={`px-sm py-xs text-caption rounded-md border transition-colors ${
              p.id === activeId
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:border-primary/50"
            }`}
            onClick={() => {
              setConfig("preset", p.id);
              setConfig("hueShift", p.hueShift);
              setConfig("saturationScale", p.saturationScale);
              setConfig("lightnessScale", p.lightnessScale);
            }}
          >
            {p.label}
          </button>
        ))}
      </Stack>
      <Stack gap="sm" className="text-body">
        <label className="flex items-center gap-sm">
          <span className="w-24 text-muted-foreground">Hue</span>
          <input
            type="range"
            min={-180}
            max={180}
            step={1}
            value={hueShift}
            onChange={(e) => setConfig("hueShift", Number(e.target.value))}
            className="flex-1"
          />
          <span className="w-10 text-right tabular-nums">{hueShift}</span>
        </label>
        <label className="flex items-center gap-sm">
          <span className="w-24 text-muted-foreground">Saturation</span>
          <input
            type="range"
            min={0}
            max={2}
            step={0.05}
            value={saturationScale}
            onChange={(e) =>
              setConfig("saturationScale", Number(e.target.value))
            }
            className="flex-1"
          />
          <span className="w-10 text-right tabular-nums">
            {saturationScale.toFixed(2)}
          </span>
        </label>
        <label className="flex items-center gap-sm">
          <span className="w-24 text-muted-foreground">Lightness</span>
          <input
            type="range"
            min={0.2}
            max={2}
            step={0.05}
            value={lightnessScale}
            onChange={(e) =>
              setConfig("lightnessScale", Number(e.target.value))
            }
            className="flex-1"
          />
          <span className="w-10 text-right tabular-nums">
            {lightnessScale.toFixed(2)}
          </span>
        </label>
      </Stack>
    </Stack>
  );
}
