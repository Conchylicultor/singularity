import { useMemo, useState } from "react";
import { MdChevronRight } from "react-icons/md";
import { cn } from "@/lib/utils";
import {
  Section,
  pluginViewPane,
  type PluginNode,
} from "@plugins/plugin-meta/plugins/plugin-view/web";
import type {
  BarrelExport,
  RouteInfo,
  SlotInfo,
} from "@plugins/plugin-meta/plugins/plugin-view/shared";

type ExportRuntime = "web" | "server" | "central" | "shared";
const RUNTIMES: ExportRuntime[] = ["web", "server", "central", "shared"];

export function PublicApiSection({ node }: { node: PluginNode }) {
  const api = node.publicApi;
  if (!api) return null;

  const totalExports = RUNTIMES.reduce(
    (sum, rt) => sum + api.exports[rt].length,
    0,
  );

  const hasContent =
    totalExports > 0 ||
    api.slots.length > 0 ||
    api.routes.length > 0 ||
    api.resources.length > 0;
  if (!hasContent) return null;

  const parts: string[] = [];
  if (totalExports > 0)
    parts.push(`${totalExports} export${totalExports !== 1 ? "s" : ""}`);
  if (api.slots.length > 0)
    parts.push(`${api.slots.length} slot${api.slots.length !== 1 ? "s" : ""}`);
  if (api.routes.length > 0)
    parts.push(
      `${api.routes.length} route${api.routes.length !== 1 ? "s" : ""}`,
    );

  const largestRuntime = RUNTIMES.reduce((best, rt) =>
    api.exports[rt].length > api.exports[best].length ? rt : best,
  );

  return (
    <Section title="Public API" count={parts.join(" · ")}>
      <div className="flex flex-col gap-3">
        {api.importedBy.length > 0 && (
          <ImportedByBanner names={api.importedBy} />
        )}
        {RUNTIMES.map((rt) =>
          api.exports[rt].length > 0 ? (
            <RuntimeGroup
              key={rt}
              runtime={rt}
              exports={api.exports[rt]}
              defaultOpen={rt === largestRuntime}
            />
          ) : null,
        )}
        {api.slots.length > 0 && <SlotsGroup slots={api.slots} />}
        {api.routes.length > 0 && <RoutesGroup routes={api.routes} />}
        {api.resources.length > 0 && (
          <SubHeading label="Resources" count={api.resources.length}>
            <div className="flex flex-col gap-0.5">
              {api.resources.map((r) => (
                <div
                  key={r.key}
                  className="flex items-center gap-2 px-2 py-0.5 text-xs"
                >
                  <code className="font-mono text-foreground">{r.key}</code>
                  <span className="text-muted-foreground/60">{r.mode}</span>
                </div>
              ))}
            </div>
          </SubHeading>
        )}
      </div>
    </Section>
  );
}

// ── Imported-by banner ──────────────────────────────────────────────

function ImportedByBanner({ names }: { names: string[] }) {
  const [expanded, setExpanded] = useState(false);
  const threshold = 4;
  const visible = expanded ? names : names.slice(0, threshold);
  const remaining = names.length - threshold;

  return (
    <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-[11px] text-muted-foreground">
      <span className="mr-0.5 font-medium">Imported by</span>
      {visible.map((name, i) => (
        <span key={name} className="inline-flex items-center">
          <PluginLink name={name} />
          {i < visible.length - 1 && <span className="text-muted-foreground/40">,</span>}
        </span>
      ))}
      {!expanded && remaining > 0 && (
        <button
          className="text-muted-foreground/60 hover:text-foreground"
          onClick={() => setExpanded(true)}
        >
          +{remaining} more
        </button>
      )}
    </div>
  );
}

// ── Runtime group ───────────────────────────────────────────────────

const RUNTIME_COLORS: Record<ExportRuntime, string> = {
  web: "text-sky-600 dark:text-sky-400",
  server: "text-emerald-600 dark:text-emerald-400",
  central: "text-violet-600 dark:text-violet-400",
  shared: "text-amber-600 dark:text-amber-400",
};

function RuntimeGroup({
  runtime,
  exports: exps,
  defaultOpen,
}: {
  runtime: ExportRuntime;
  exports: BarrelExport[];
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  const sorted = useMemo(
    () =>
      [...exps].sort((a, b) => {
        const order = { hook: 0, component: 1, value: 2, type: 3 };
        const d = order[a.category] - order[b.category];
        return d !== 0 ? d : a.name.localeCompare(b.name);
      }),
    [exps],
  );

  return (
    <div>
      <button
        className="flex w-full items-center gap-1 py-0.5 text-xs"
        onClick={() => setOpen(!open)}
      >
        <MdChevronRight
          className={cn(
            "size-3.5 text-muted-foreground transition-transform",
            open && "rotate-90",
          )}
        />
        <span className={cn("font-mono font-medium", RUNTIME_COLORS[runtime])}>
          {runtime}
        </span>
        <span className="text-muted-foreground/50">({exps.length})</span>
      </button>
      {open && (
        <div className="ml-1 flex flex-col gap-px border-l border-border/50 pl-3 pt-0.5">
          {sorted.map((exp) => (
            <SymbolRow key={exp.name} exp={exp} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Symbol row ──────────────────────────────────────────────────────

const CATEGORY_STYLES: Record<
  BarrelExport["category"],
  { label: string; className: string }
> = {
  hook: {
    label: "hook",
    className: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  },
  component: {
    label: "comp",
    className: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  },
  type: {
    label: "type",
    className: "bg-zinc-500/10 text-zinc-500 dark:text-zinc-400",
  },
  value: {
    label: "val",
    className: "bg-stone-500/10 text-stone-600 dark:text-stone-400",
  },
};

function SymbolRow({ exp }: { exp: BarrelExport }) {
  const style = CATEGORY_STYLES[exp.category];
  const consumers = exp.consumers ?? [];

  return (
    <div className="group flex items-center gap-2 rounded-sm px-1.5 py-px text-xs hover:bg-accent/50">
      <span
        className={cn(
          "inline-flex w-10 shrink-0 justify-center rounded px-1 py-px font-mono text-[10px] font-medium",
          style.className,
        )}
      >
        {style.label}
      </span>
      <code className="min-w-0 truncate font-mono text-foreground">
        {exp.name}
      </code>
      {consumers.length > 0 && <ConsumerList names={consumers} />}
    </div>
  );
}

function ConsumerList({ names }: { names: string[] }) {
  const [expanded, setExpanded] = useState(false);
  const threshold = 2;
  const visible = expanded ? names : names.slice(0, threshold);
  const remaining = names.length - threshold;

  return (
    <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground/60">
      <span>←</span>
      {visible.map((name, i) => (
        <span key={name}>
          <PluginLink name={name} />
          {i < visible.length - 1 && ","}
        </span>
      ))}
      {!expanded && remaining > 0 && (
        <button
          className="hover:text-foreground"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(true);
          }}
        >
          +{remaining}
        </button>
      )}
    </span>
  );
}

// ── Slots group ─────────────────────────────────────────────────────

function SlotsGroup({ slots }: { slots: SlotInfo[] }) {
  return (
    <SubHeading label="Slots" count={slots.length}>
      <div className="flex flex-col gap-0.5">
        {slots.map((s) => (
          <div
            key={s.slotId}
            className="flex items-center gap-2 px-2 py-0.5 text-xs"
          >
            <code className="font-mono text-foreground">
              {s.groupName}.{s.memberName}
            </code>
            {s.contributors.length > 0 && (
              <span className="ml-auto text-[10px] text-muted-foreground/60">
                {s.contributors.length} contributor
                {s.contributors.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        ))}
      </div>
    </SubHeading>
  );
}

// ── Routes group ────────────────────────────────────────────────────

const METHOD_COLORS: Record<string, string> = {
  GET: "text-emerald-600 dark:text-emerald-400",
  POST: "text-blue-600 dark:text-blue-400",
  PUT: "text-amber-600 dark:text-amber-400",
  PATCH: "text-amber-600 dark:text-amber-400",
  DELETE: "text-red-600 dark:text-red-400",
  WS: "text-violet-600 dark:text-violet-400",
};

function RoutesGroup({ routes }: { routes: RouteInfo[] }) {
  return (
    <SubHeading label="Routes" count={routes.length}>
      <div className="flex flex-col gap-0.5">
        {routes.map((r) => {
          const spaceIdx = r.route.indexOf(" ");
          const method = spaceIdx > 0 ? r.route.slice(0, spaceIdx) : "";
          const path = spaceIdx > 0 ? r.route.slice(spaceIdx + 1) : r.route;
          return (
            <div
              key={r.route}
              className="flex items-center gap-2 px-2 py-0.5 text-xs"
            >
              {method && (
                <span
                  className={cn(
                    "w-10 shrink-0 font-mono text-[10px] font-semibold",
                    METHOD_COLORS[method] ?? "text-muted-foreground",
                  )}
                >
                  {method}
                </span>
              )}
              <code className="min-w-0 truncate font-mono text-foreground">
                {path}
              </code>
              {r.callers.length > 0 && (
                <span className="ml-auto text-[10px] text-muted-foreground/60">
                  {r.callers.length} caller
                  {r.callers.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </SubHeading>
  );
}

// ── Shared primitives ───────────────────────────────────────────────

function SubHeading({
  label,
  count,
  children,
}: {
  label: string;
  count: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <button
        className="flex w-full items-center gap-1 py-0.5 text-xs"
        onClick={() => setOpen(!open)}
      >
        <MdChevronRight
          className={cn(
            "size-3.5 text-muted-foreground transition-transform",
            open && "rotate-90",
          )}
        />
        <span className="font-medium text-muted-foreground">{label}</span>
        <span className="text-muted-foreground/50">({count})</span>
      </button>
      {open && (
        <div className="ml-1 border-l border-border/50 pl-3 pt-0.5">
          {children}
        </div>
      )}
    </div>
  );
}

function PluginLink({ name }: { name: string }) {
  return (
    <button
      className="font-medium text-muted-foreground hover:text-foreground hover:underline"
      onClick={(e) => {
        e.stopPropagation();
        pluginViewPane.open({ pluginId: name }, { append: true });
      }}
    >
      {name}
    </button>
  );
}
