import { useState, useEffect, useRef } from "react";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import {
  useSpecsWithPlugin,
  useSectionsWithPlugin,
  type SpecWithPlugin,
  type SectionWithPlugin,
} from "../slots";
import {
  fullKey,
  normalize,
  type NormalizedField,
} from "@plugins/config/core";
import { configResource, resetConfigValue, setConfigValue } from "../internal/config-client";
import { Field } from "./field";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Group {
  pluginId: string;
  pluginName: string;
  pluginDescription?: string;
  fields: NormalizedField[];
  sections: SectionWithPlugin[];
}

function buildGroups(
  specs: SpecWithPlugin[],
  sections: SectionWithPlugin[],
): Group[] {
  const byId = new Map<string, Group>();
  const ensure = (
    pluginId: string,
    pluginName: string,
    pluginDescription?: string,
  ): Group => {
    const existing = byId.get(pluginId);
    if (existing) return existing;
    const g: Group = {
      pluginId,
      pluginName,
      pluginDescription,
      fields: [],
      sections: [],
    };
    byId.set(pluginId, g);
    return g;
  };
  for (const s of specs) {
    const fields = normalize(s.descriptor.schema);
    if (fields.length === 0) continue;
    const g = ensure(s.pluginId, s.pluginName, s.pluginDescription);
    g.fields.push(...fields);
  }
  for (const s of sections) {
    const g = ensure(s.pluginId, s.pluginName, s.pluginDescription);
    g.sections.push(s);
  }
  return [...byId.values()].sort((a, b) => a.pluginName.localeCompare(b.pluginName));
}

export function SettingsPanel() {
  const specs = useSpecsWithPlugin();
  const sections = useSectionsWithPlugin();
  const groups = buildGroups(specs, sections);
  const { data: values } = useResource(configResource);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!scrollRef.current || groups.length === 0) return;
    const root = scrollRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
            break;
          }
        }
      },
      { root, rootMargin: "-10% 0px -75% 0px", threshold: 0 },
    );
    groups.forEach((g) => {
      const el = root.querySelector(`#section-${g.pluginId}`);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [groups]);

  const scrollTo = (id: string) => {
    scrollRef.current
      ?.querySelector(`#${id}`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

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
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-4xl px-6 py-8">
          <h1 className="text-2xl font-semibold">Settings</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            No plugins have declared configurable values yet.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-6 py-8">
        <h1 className="text-2xl font-semibold">Settings</h1>
        {error ? (
          <p className="mt-3 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <div className="mt-6 flex gap-10">
          {/* TOC */}
          <nav className="w-40 shrink-0">
            <div className="sticky top-0 space-y-0.5">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
                Plugins
              </p>
              {groups.map((g) => {
                const sectionId = `section-${g.pluginId}`;
                return (
                  <button
                    key={g.pluginId}
                    onClick={() => scrollTo(sectionId)}
                    className={cn(
                      "block w-full rounded px-2 py-1 text-left text-sm transition-colors",
                      activeId === sectionId
                        ? "bg-accent font-medium text-accent-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {g.pluginName}
                  </button>
                );
              })}
            </div>
          </nav>

          {/* Sections */}
          <div className="min-w-0 flex-1 space-y-5">
            {groups.map((g) => (
              <section
                key={g.pluginId}
                id={`section-${g.pluginId}`}
                className="rounded-lg border border-border bg-card p-5"
              >
                <header className="mb-4">
                  <h2 className="text-base font-semibold">{g.pluginName}</h2>
                  {g.pluginDescription ? (
                    <p className="mt-0.5 text-xs text-muted-foreground">{g.pluginDescription}</p>
                  ) : null}
                </header>
                <div className="divide-y divide-border">
                  {g.fields.map((f) => {
                    const fk = fullKey(g.pluginId, f.key);
                    const stored = values[fk];
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
                {g.sections.length > 0 ? (
                  <div className="mt-4 space-y-6">
                    {g.sections.map((s) => (
                      <div key={s.id}>
                        <h3 className="text-sm font-medium">{s.title}</h3>
                        {s.description ? (
                          <p className="mb-2 text-xs text-muted-foreground">
                            {s.description}
                          </p>
                        ) : null}
                        <div className="mt-2">
                          <s.component />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
