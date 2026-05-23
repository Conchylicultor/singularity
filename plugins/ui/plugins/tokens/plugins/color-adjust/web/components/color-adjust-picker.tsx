import { useConfig, useSetConfig } from "@plugins/config_v2/web";
import { colorAdjustConfig } from "../internal/config";
import { ColorAdjust } from "../slots";

export function ColorAdjustPicker() {
  const presets = ColorAdjust.Preset.useContributions();
  const config = useConfig(colorAdjustConfig);
  const setConfig = useSetConfig(colorAdjustConfig);
  const activeId = config.preset;
  const hueShift = config.hueShift;
  const saturationScale = config.saturationScale;
  const lightnessScale = config.lightnessScale;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        {presets.map((p) => (
          <button
            key={p.id}
            className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
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
      </div>
      <div className="flex flex-col gap-2 text-sm">
        <label className="flex items-center gap-2">
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
        <label className="flex items-center gap-2">
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
        <label className="flex items-center gap-2">
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
      </div>
    </div>
  );
}
