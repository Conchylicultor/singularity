import { useConfig, useSetConfig } from "@plugins/config_v2/web";
import { densityConfig } from "../internal/config";
import { Density } from "../slots";

export function DensityPicker() {
  const presets = Density.Preset.useContributions();
  const { preset: activeId } = useConfig(densityConfig);
  const setConfig = useSetConfig(densityConfig);

  if (presets.length === 0) {
    return (
      <span className="text-sm text-muted-foreground">
        No presets available
      </span>
    );
  }

  return (
    <div className="flex gap-2">
      {presets.map((p) => (
        <button
          key={p.id}
          className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-md border transition-colors ${
            p.id === activeId
              ? "border-primary bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:border-primary/50"
          }`}
          onClick={() => setConfig("preset", p.id)}
        >
          <span
            className="inline-flex border border-current rounded-sm bg-current/20"
            style={{
              padding: `${p.light.padChipY} ${p.light.padChipX}`,
            }}
          >
            <span className="size-1.5 rounded-full bg-current" />
          </span>
          {p.label}
        </button>
      ))}
    </div>
  );
}
