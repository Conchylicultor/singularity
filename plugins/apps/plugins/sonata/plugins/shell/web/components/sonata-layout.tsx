import type { ComponentType } from "react";
import { cn } from "@/lib/utils";
import { PaneOverlayHost } from "@plugins/layouts/plugins/miller/web";
import { Sonata } from "../slots";
import { SonataProvider, useSonata } from "../context";

/**
 * A horizontal picker rendered from a list of `{ id, label, icon? }` items.
 * Generic over the contribution shape — never names a specific contributor
 * (collection-consumer clean).
 */
function Picker({
  items,
  activeId,
  onSelect,
  empty,
  loadedIds,
}: {
  items: {
    id: string;
    label: string;
    icon?: ComponentType<{ className?: string }>;
  }[];
  activeId: string | null;
  onSelect: (id: string) => void;
  empty: string;
  /** Ids that carry loaded input — rendered with a filled dot (e.g. sources). */
  loadedIds?: string[];
}) {
  if (items.length === 0) {
    return <span className="text-xs text-muted-foreground">{empty}</span>;
  }
  return (
    <div className="flex flex-wrap items-center gap-1">
      {items.map((item) => {
        const Icon = item.icon;
        const active = item.id === activeId;
        const loaded = loadedIds?.includes(item.id) ?? false;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            aria-pressed={active}
            className={cn(
              "flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
              active
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border bg-transparent text-muted-foreground hover:bg-muted/50",
            )}
          >
            {Icon ? <Icon className="size-3.5" /> : null}
            {item.label}
            {loaded ? (
              <span
                aria-label="loaded"
                className="size-1.5 rounded-full bg-primary"
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function SonataLayoutInner() {
  const {
    score,
    cursorBeat,
    isPlaying,
    tempoScale,
    activeSourceId,
    activeDisplayId,
    loadedSourceIds,
    activeRaw,
    setActiveSource,
    setActiveDisplay,
    setRaw,
    play,
    stop,
  } = useSonata();

  const sources = Sonata.Source.useContributions();
  // Enumerate displays via the dispatch slot's contributions — the `Extra`
  // metadata (id/label/icon/capabilities) is fully readable; only `component`
  // is sealed. Never names a specific display.
  const displays = Sonata.Display.useContributions();

  // Default the active display to the first contributed one.
  const effectiveDisplayId = activeDisplayId ?? displays[0]?.id ?? null;

  const activeSource = sources.find((s) => s.id === activeSourceId);
  const LoaderComponent = activeSource?.LoaderComponent;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
      {/* Toolbar: source picker, display picker, transport. */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-border px-6 py-3">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Source
          </span>
          <Picker
            items={sources.map((s) => ({
              id: s.id,
              label: s.label,
              icon: s.icon,
            }))}
            activeId={activeSourceId}
            onSelect={setActiveSource}
            empty="No sources"
            loadedIds={loadedSourceIds}
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Display
          </span>
          <Picker
            items={displays.map((d) => ({
              id: d.id,
              label: d.label,
              icon: d.icon,
            }))}
            activeId={effectiveDisplayId}
            onSelect={setActiveDisplay}
            empty="No displays"
          />
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={isPlaying ? stop : play}
            className="rounded-md border border-border px-3 py-1 text-xs font-medium hover:bg-muted/50"
          >
            {isPlaying ? "Stop" : "Play"}
          </button>
          <span className="tabular-nums text-xs text-muted-foreground">
            beat {cursorBeat.toFixed(2)}
          </span>
          <span className="tabular-nums text-xs text-muted-foreground">
            {tempoScale.toFixed(2)}×
          </span>
        </div>
      </div>

      {/* Transport strip: full-width progression bar (and future transport
          widgets). Renders nothing when no contributor is present. */}
      <Sonata.Transport.Render>
        {(t) => <t.component key={t.id} />}
      </Sonata.Transport.Render>

      {/* Active source loader (UI to provide input). */}
      {LoaderComponent ? (
        <div className="border-b border-border px-6 py-3">
          <LoaderComponent raw={activeRaw} onRaw={setRaw} />
        </div>
      ) : null}

      {/* Main area: the active display + free-floating Section panels. */}
      <div className="flex min-h-0 flex-1">
        <div className="min-h-0 flex-1 overflow-hidden">
          {effectiveDisplayId ? (
            <Sonata.Display.Dispatch
              score={score}
              cursorBeat={cursorBeat}
              tempoScale={tempoScale}
              activeDisplayId={effectiveDisplayId}
            />
          ) : (
            <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
              No display selected.
            </div>
          )}
        </div>

        {/* Free-floating panels (current-chord readout, controls, …). */}
        <div className="w-80 shrink-0 space-y-4 overflow-auto border-l border-border p-4">
          <Sonata.Section.Render subId="editor">
            {(s) => (s.area === "editor" ? <s.component key={s.label} /> : null)}
          </Sonata.Section.Render>
          <Sonata.Section.Render subId="player">
            {(s) => (s.area !== "editor" ? <s.component key={s.label} /> : null)}
          </Sonata.Section.Render>
        </div>
      </div>
    </div>
  );
}

export function SonataLayout() {
  return (
    <SonataProvider>
      {/* Sonata owns a bespoke full-viewport layout (no MillerColumns), so it
          mounts a PaneOverlayHost to host global pane actions (e.g. the theme
          customizer) as an overlay above its own UI. */}
      <div className="relative h-full min-h-0">
        <SonataLayoutInner />
        <PaneOverlayHost />
      </div>
    </SonataProvider>
  );
}
