import { type ReactElement, useEffect, useState } from "react";
import {
  Pane,
  clearRoute,
  type,
} from "@plugins/primitives/plugins/pane/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { Text } from "@plugins/primitives/plugins/text/web";
import { Button } from "@/components/ui/button";
import {
  Sonata,
  TEMPO_MATH_FLOOR,
  publishSonataTransport,
  useSonata,
} from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { songsResource } from "../core";
import { Library } from "./slots";
import { SonataLibrarySurface } from "./components/library-surface";
import { Picker } from "./components/display-picker";
import { SectionPane } from "./components/section-pane";

// Panes are declared first so their types are known before the component bodies
// reference them. The component identifiers below are hoisted function
// declarations, so the forward reference is safe at runtime.

/**
 * The library index pane — Sonata's landing surface at bare `/sonata`. Empty
 * segment + `appPath` makes it the app's index pane (the empty route resolves
 * here via `useIndexMatch`). `chrome:false` because the gallery is its own UI.
 */
export const sonataLibraryPane = Pane.define({
  id: "sonata-library",
  segment: "",
  appPath: "/sonata",
  chrome: false,
  component: SonataLibrarySurface,
});

/**
 * The player pane at `/sonata/song/:songId` — a real URL that survives reload
 * and back/forward. Opened with `mode:"root"` so each open replaces the route
 * with a single full-surface pane (a fresh instance, hence a remount). The
 * optimistic `title` rides in `input` so the header shows immediately, before
 * the song resource confirms. `resolve` hydrates every source for the song on
 * direct navigation / reload (see {@link useSonataPlayerResolve}).
 */
export const sonataPlayerPane = Pane.define({
  id: "sonata-player",
  segment: "song/:songId",
  chrome: false,
  input: type<{ title: string }>(),
  resolve: useSonataPlayerResolve,
  component: SonataPlayerSurface,
});

/**
 * Resolve hook: hydrate every registered source's raw for `songId` and gate the
 * pane on the song existing. Lifted out of `useOpenSong` so hydration also runs
 * on direct navigation / reload (a deep-linked `/sonata/song/:id`), not only on a
 * library click. Source-agnostic: a source with no data for the song returns
 * `undefined` and is skipped.
 */
function useSonataPlayerResolve({ songId }: { songId: string }) {
  const songsResult = useResource(songsResource);
  const sources = Library.Source.useContributions();
  const { setRawMap } = useSonata();
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setHydratedFor(null);
    void (async () => {
      const rawMap: Record<string, unknown> = {};
      await Promise.all(
        sources.map(async (s) => {
          const raw = await s.hydrate(songId);
          if (raw !== undefined) rawMap[s.sourceId] = raw;
        }),
      );
      if (cancelled) return;
      setRawMap(rawMap);
      setHydratedFor(songId);
    })();
    return () => {
      cancelled = true;
    };
  }, [songId, sources, setRawMap]);

  const hydrated = hydratedFor === songId;
  // `found` is gated by `hydrated` (requires the effect above to complete), so
  // the resource is guaranteed settled by the time `found` can be true. Reading
  // `.data` only when not pending avoids the collapse.
  const found = hydrated && !songsResult.pending && songsResult.data.some((s) => s.id === songId);
  return { pending: !hydrated, found };
}

/**
 * The player surface — the `view==="player"` chrome of the old bespoke layout,
 * now a full-surface pane: ← Library + song title, the Display picker, the
 * `Sonata.Toolbar` widgets, the `Sonata.Transport` strip, the active display
 * (`Sonata.Display.Dispatch`), and the collapsible `SectionPane`.
 */
function SonataPlayerSurface(): ReactElement {
  const { songId } = sonataPlayerPane.useParams();
  const input = sonataPlayerPane.useInput();
  const {
    score,
    currentSongTitle,
    cursorBeat,
    tempoScale,
    activeDisplayId,
    setActiveDisplay,
    setCurrentSong,
    clearCurrentSong,
    togglePlay,
    seekBy,
    nudgeTempo,
  } = useSonata();

  // Mark this song open on mount (once per open — each open is a fresh
  // `mode:"root"` instance, so this fires exactly once and bumps `songOpenEpoch`).
  // Clear on unmount so library-state effects don't mis-attribute playback.
  // Title comes from `input.title` (set by the library on open); `resolve` gated
  // `found` on the song existing, so by mount the resource is settled but we
  // avoid reading it here to keep the dependency footprint minimal.
  useEffect(() => {
    setCurrentSong({ id: songId, title: input.title ?? "Untitled" });
    return () => clearCurrentSong();
    // Re-run only when the song id changes; `setCurrentSong`/`clearCurrentSong`
    // are stable. `input.title` is intentionally read once at open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songId]);

  // Publish the transport to the module-level bus while the player is mounted,
  // so global keyboard shortcuts (Space/arrows) drive playback only on this
  // surface. The "player on screen" gate is implicit: the bus is empty on the
  // library, so no `view` check is needed.
  useEffect(() => {
    publishSonataTransport({ togglePlay, seekBy, nudgeTempo });
    return () => publishSonataTransport(null);
  }, [togglePlay, seekBy, nudgeTempo]);

  // Enumerate displays via the dispatch slot's contributions — the `Extra`
  // metadata (id/label/icon/capabilities) is fully readable; only `component`
  // is sealed. Never names a specific display.
  const displays = Sonata.Display.useContributions();
  const effectiveDisplayId = activeDisplayId ?? displays[0]?.id ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
      {/* Toolbar: back-to-library + title, display picker, transport. */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-border pl-6 pr-floating-bar py-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="xs" onClick={() => clearRoute()}>
            ← Library
          </Button>
          <Text variant="body" className="font-semibold text-foreground">
            {currentSongTitle ?? "Untitled"}
          </Text>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
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
            <Text
              as="div"
              variant="body"
              tone="muted"
              className="flex h-full items-center justify-center p-8"
            >
              No display selected.
            </Text>
          )}
        </div>

        {/* Free-floating panels (current-chord readout, controls, …),
            collapsible to a thin rail. */}
        <SectionPane />
      </div>
    </div>
  );
}
