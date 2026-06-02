import { useConfig, useSetConfig } from "@plugins/config_v2/web";
import { categoricalConfig } from "../internal/config";
import { Categorical } from "../slots";

const KEYS = [
  "categorical-1",
  "categorical-2",
  "categorical-3",
  "categorical-4",
  "categorical-5",
  "categorical-6",
  "categorical-7",
  "categorical-8",
  "categorical-9",
  "categorical-10",
] as const;

export function CategoricalPicker() {
  const presets = Categorical.Preset.useContributions();
  const { preset: activeId } = useConfig(categoricalConfig);
  const setConfig = useSetConfig(categoricalConfig);

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
          <span className="flex gap-0.5">
            {KEYS.map((k) => (
              <span
                key={k}
                className="size-3 rounded-full border border-border"
                style={{ backgroundColor: p.light[k] }}
              />
            ))}
          </span>
          {p.label}
        </button>
      ))}
    </div>
  );
}
