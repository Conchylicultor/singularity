import { useState } from "react";
import { useResource } from "@core";
import { useSpecsWithPlugin, type SpecWithPlugin } from "../slots";
import {
  fullKey,
  normalize,
  type NormalizedField,
} from "@plugins/config/shared";
import { configResource, resetConfigValue, setConfigValue } from "../api";
import { Field } from "./field";
import { Button } from "@/components/ui/button";

interface Group {
  pluginId: string;
  pluginName: string;
  pluginDescription?: string;
  fields: NormalizedField[];
}

function buildGroups(specs: SpecWithPlugin[]): Group[] {
  const byId = new Map<string, Group>();
  for (const s of specs) {
    const fields = normalize(s.descriptor.schema);
    if (fields.length === 0) continue;
    const existing = byId.get(s.pluginId);
    if (existing) {
      existing.fields.push(...fields);
    } else {
      byId.set(s.pluginId, {
        pluginId: s.pluginId,
        pluginName: s.pluginName,
        pluginDescription: s.pluginDescription,
        fields,
      });
    }
  }
  return [...byId.values()].sort((a, b) => a.pluginName.localeCompare(b.pluginName));
}

export function SettingsPanel() {
  const specs = useSpecsWithPlugin();
  const groups = buildGroups(specs);
  const { data: values } = useResource(configResource);
  const [error, setError] = useState<string | null>(null);

  const commit = async (fk: string, value: unknown) => {
    try {
      setError(null);
      await setConfigValue(fk, value);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const reset = async (fk: string) => {
    try {
      setError(null);
      await resetConfigValue(fk);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (groups.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-8">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          No plugins have declared configurable values yet.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <h1 className="text-2xl font-semibold">Settings</h1>
      {error ? (
        <p className="mt-3 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="mt-6 space-y-10">
        {groups.map((g) => (
          <section key={g.pluginId}>
            <header className="mb-2 border-b border-border pb-2">
              <h2 className="text-lg font-semibold">{g.pluginName}</h2>
              {g.pluginDescription ? (
                <p className="text-xs text-muted-foreground">{g.pluginDescription}</p>
              ) : null}
            </header>
            <div className="divide-y divide-border">
              {g.fields.map((f) => {
                const fk = fullKey(g.pluginId, f.key);
                const stored = values?.[fk];
                const current = stored ?? f.default;
                const isOverridden = stored !== undefined;
                return (
                  <div key={fk} className="relative">
                    <Field
                      field={f}
                      fullKey={fk}
                      value={current}
                      onCommit={(v) => void commit(fk, v)}
                    />
                    {isOverridden ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="absolute right-0 top-3 text-xs text-muted-foreground"
                        onClick={() => void reset(fk)}
                      >
                        Reset
                      </Button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
