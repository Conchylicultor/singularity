import type { ComponentType } from "react";
import { MdChevronLeft, MdChevronRight } from "react-icons/md";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PaneOverlayHost } from "@plugins/layouts/plugins/miller/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { useDraft } from "@plugins/primitives/plugins/persistent-draft/web";
import { Sonata } from "../slots";
import { SonataProvider, useSonata, TEMPO_MATH_FLOOR } from "../context";

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
            // eslint-disable-next-line row/no-adhoc-row -- bespoke picker: per-item "loaded" dot indicator that SegmentedControl can't express
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

/**
 * The right-hand panel column hosting the `Sonata.Section` contributions
 * (track mixer, chord readout, …). Collapsible to a thin rail so the active
 * display can take the full width; the choice persists across reloads.
 */
function SectionPane() {
  const [collapsed, setCollapsed] = useDraft(
    "sonata.section-pane.collapsed",
    false,
  );

  if (collapsed) {
    return (
      <div className="flex w-8 shrink-0 flex-col items-center gap-2 border-l border-border bg-muted/40 py-2">
        <IconButton
          icon={MdChevronLeft}
          label="Expand panels"
          side="left"
          onClick={() => setCollapsed(false)}
        />
        <span
          style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
          className="text-[11px] font-medium text-muted-foreground"
        >
          Panels
        </span>
      </div>
    );
  }

  return (
    <div className="flex w-80 shrink-0 flex-col border-l border-border">
      <div className="flex justify-end px-2 pt-2">
        <IconButton
          icon={MdChevronRight}
          label="Collapse panels"
          side="left"
          onClick={() => setCollapsed(true)}
        />
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-auto px-4 pb-4">
        <Sonata.Section.Render subId="editor">
          {(s) => (s.area === "editor" ? <s.component key={s.label} /> : null)}
        </Sonata.Section.Render>
        <Sonata.Section.Render subId="player">
          {(s) => (s.area !== "editor" ? <s.component key={s.label} /> : null)}
        </Sonata.Section.Render>
      </div>
    </div>
  );
}

function SonataLayoutInner() {
  const {
    score,
    view,
    currentSongTitle,
    cursorBeat,
    tempoScale,
    activeDisplayId,
    setActiveDisplay,
    backToLibrary,
  } = useSonata();

  // Enumerate displays via the dispatch slot's contributions — the `Extra`
  // metadata (id/label/icon/capabilities) is fully readable; only `component`
  // is sealed. Never names a specific display.
  const displays = Sonata.Display.useContributions();

  // Default the active display to the first contributed one.
  const effectiveDisplayId = activeDisplayId ?? displays[0]?.id ?? null;

  // LIBRARY — the landing surface. The (separate) library plugin contributes its
  // gallery to `Sonata.Home`; the shell just gives it the full area. Renders
  // blank if nothing is contributed yet.
  if (view === "library") {
    return (
      <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
        <Sonata.Home.Render>{(h) => <h.component key={h.id} />}</Sonata.Home.Render>
      </div>
    );
  }

  // PLAYER — streamlined chrome: ← Library + song title replace the Source
  // picker; the Display picker and transport cluster stay. No Source picker and
  // no active-source loader strip.
  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
      {/* Toolbar: back-to-library + title, display picker, transport. */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-border px-6 py-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="xs" onClick={backToLibrary}>
            ← Library
          </Button>
          <span className="text-sm font-semibold text-foreground">
            {currentSongTitle ?? "Untitled"}
          </span>
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

        {/* Toolbar action widgets (transport controls: play/pause, speed, …).
            Open slot — renders nothing until a plugin contributes. */}
        <div className="ml-auto flex items-center gap-2">
          <Sonata.Toolbar.Render>
            {(t) => <t.component key={t.id} />}
          </Sonata.Toolbar.Render>
        </div>
      </div>

      {/* Transport strip: full-width progression bar (and future transport
          widgets). Renders nothing when no contributor is present. */}
      <Sonata.Transport.Render>
        {(t) => <t.component key={t.id} />}
      </Sonata.Transport.Render>

      {/* Main area: the active display + free-floating Section panels. */}
      <div className="flex min-h-0 flex-1">
        <div className="min-h-0 flex-1 overflow-hidden">
          {effectiveDisplayId ? (
            <Sonata.Display.Dispatch
              score={score}
              cursorBeat={cursorBeat}
              // Displays scale geometry by this to cancel the scale folded into
              // `score`; floor it so a frozen 0% (which scales `score` by the
              // same floor) cancels to a finite layout instead of NaN.
              tempoScale={Math.max(tempoScale, TEMPO_MATH_FLOOR)}
              activeDisplayId={effectiveDisplayId}
            />
          ) : (
            <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
              No display selected.
            </div>
          )}
        </div>

        {/* Free-floating panels (current-chord readout, controls, …),
            collapsible to a thin rail. */}
        <SectionPane />
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
        {/* Headless, always-mounted Sonata-scoped side effects (e.g. play
            recording). Contributors render nothing; they observe context. */}
        <Sonata.Effect.Render>
          {(e) => <e.component key={e.id} />}
        </Sonata.Effect.Render>
      </div>
    </SonataProvider>
  );
}
