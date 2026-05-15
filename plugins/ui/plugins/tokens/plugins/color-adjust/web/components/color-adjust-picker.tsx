import { useConfigValues, setConfigValue } from "@plugins/config/web";
import { colorAdjustConfig } from "../internal/config";
import { ColorAdjust } from "../slots";

const PLUGIN_ID = "ui-tokens-color-adjust";

function setField(field: string, value: string | number) {
  void setConfigValue(`${PLUGIN_ID}.${field}`, value);
}

export function ColorAdjustPicker() {
  const presets = ColorAdjust.Preset.useContributions();
  const config = useConfigValues(colorAdjustConfig, PLUGIN_ID);
  const activeId = config.preset as string;
  const hueShift = config.hueShift as number;
  const saturationScale = config.saturationScale as number;
  const lightnessScale = config.lightnessScale as number;

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
              setField("preset", p.id);
              setField("hueShift", p.hueShift);
              setField("saturationScale", p.saturationScale);
              setField("lightnessScale", p.lightnessScale);
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
            onChange={(e) => setField("hueShift", Number(e.target.value))}
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
              setField("saturationScale", Number(e.target.value))
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
              setField("lightnessScale", Number(e.target.value))
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
