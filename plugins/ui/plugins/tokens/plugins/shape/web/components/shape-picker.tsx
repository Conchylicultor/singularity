import { useConfig, useSetConfig } from "@plugins/config_v2/web";
import { shapeConfig } from "../internal/config";
import { Shape } from "../slots";

export function ShapePicker() {
  const presets = Shape.Preset.useContributions();
  const { preset: activeId } = useConfig(shapeConfig);
  const setConfig = useSetConfig(shapeConfig);

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
            className="size-3 border border-current"
            style={{ borderRadius: p.light.radius }}
          />
          {p.label}
        </button>
      ))}
    </div>
  );
}
