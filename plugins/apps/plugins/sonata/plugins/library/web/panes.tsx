import { type ReactElement, useEffect, useState } from "react";
import {
  Pane,
  PaneChrome,
  type,
  type Hint,
  defineRoute,
  resolveRow,
  type ResolveResult,
} from "@plugins/primitives/plugins/pane/web";
import { mapRow, useLiveRow } from "@plugins/network/plugins/live/web";
import { foldResource } from "@plugins/primitives/plugins/live-state/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import {
  Sonata,
  TEMPO_MATH_FLOOR,
  useSonata,
} from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { sonataApp } from "@plugins/apps/plugins/sonata/plugins/shell/core";
import { Column } from "@plugins/primitives/plugins/css/plugins/column/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Clip } from "@plugins/primitives/plugins/css/plugins/clip/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { songLibrary } from "../core";
import { Library } from "./slots";
import { SonataLibrarySurface } from "./components/library-surface";
import { SongTitle } from "./components/song-title-field";
import { SectionPane } from "./components/section-pane";

// Panes are declared first so their types are known before the component bodies
// reference them. The component identifiers below are hoisted function
// declarations, so the forward reference is safe at runtime.

/**
 * The library index pane — Sonata's landing surface at bare `/sonata`.
 * `appIndex` marks it as the app's index pane (the empty route resolves here
 * via `useIndexMatch`). Standard chrome with a "Library" title; the
 * `Sonata.Home` gallery owns its scroll inside the chrome's single `PaneScroll`.
 */
export const sonataLibraryPane = Pane.define({
  title: "Library",
  route: defineRoute({ id: "sonata-library", segment: "" }),
  app: sonataApp,
  appIndex: true,
  component: SonataLibraryBody,
});

function SonataLibraryBody(): ReactElement {
  return (
    <PaneChrome pane={sonataLibraryPane}>
      <SonataLibrarySurface />
    </PaneChrome>
  );
}

/**
 * The player pane at `/sonata/song/:songId` — a real URL that survives reload
 * and back/forward. Opened with `mode:"root"` so each open replaces the route
 * with a single full-surface pane (a fresh instance, hence a remount). The
 * optimistic `title` rides in `hint` purely as a DISPLAY value for `title.text`
 * (the browser-tab / tab-strip label before the song's live row settles) —
 * it is NOT a data source: the header title and every consumer read the
 * canonical row from `songLibrary`. `useResolve` hydrates every source for the song on
 * direct navigation / reload (see {@link useSonataPlayerResolve}).
 */
export const sonataPlayerPane = Pane.define({
  route: defineRoute({ id: "sonata-player", segment: "song/:songId" }),
  app: sonataApp,
  // Display-only optimistic label for `title.text` (tab/document title) before the
  // song's row settles. Structurally unwritable: `Hint.pick` hands it back
  // only alongside the canonical value, and it is never persisted. The title is
  // library-owned (`songLibrary`); the shell keeps no mirror.
  hint: type<{ title: string }>(),
  useResolve: useSonataPlayerResolve,
  component: SonataPlayerSurface,
  // Title: `text` (tab/document title) is the canonical song name from its live
  // library row (reflects renames), falling back to the optimistic hint
  // carried at open time while it loads. Self-contained — `useSonata()` context
  // is unavailable at the tab-surface level where it runs. The header paints
  // `component` instead: the inline-editable title, mounted inside the pane so
  // it may read app context.
  title: { useText: useSongTitle, component: SongTitle },
  // Main surface: aux panes opened to the right never steal the tab title.
  titleOwner: true,
});

/** Canonical song title from its live library row, or the optimistic open hint. */
function useSongTitle(
  { songId }: { songId: string },
  hint: Hint<{ title: string }>,
): string | undefined {
  const song = useLiveRow(songLibrary, songId);
  // `canonical` stays `undefined` until the row settles — precisely what
  // `pick` reads as "not known yet", so the hint shows through in the meantime
  // and is superseded the instant the real row (and any rename) arrives. A
  // failed read offers its last-seen row (`stale`), else the hint stays.
  const canonical = foldResource(
    mapRow(song, (row) => row?.title),
    {
      loading: () => undefined,
      error: (_error, stale) => stale,
      ready: (title) => title,
    },
  );
  return hint.pick("title", canonical);
}

/**
 * Resolve hook: hydrate every registered source's raw for `songId` and gate the
 * pane on the song existing. Lifted out of `useOpenSong` so hydration also runs
 * on direct navigation / reload (a deep-linked `/sonata/song/:id`), not only on a
 * library click. Source-agnostic: a source with no data for the song returns
 * `undefined` and is skipped.
 */
function useSonataPlayerResolve({ songId }: { songId: string }): ResolveResult {
  const song = useLiveRow(songLibrary, songId);
  const sources = Library.Source.useContributions();
  const { setRawMap } = useSonata();
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    /* eslint-disable react-hooks/set-state-in-effect -- async hydration with cancellation flag: fans out over the dynamic plugin-contributed Library.Source registry (Promise.all of per-source hydrate), so a single useLive/useEndpoint cannot express it; setHydratedFor(null) resets the settle gate before the await and setRawMap/setHydratedFor(songId) commit only after the cancel guard, which is genuinely stateful (no derive-in-render equivalent). */
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
      // The song id travels WITH its content: loading it hands the song's
      // settings over in the same write (see `setRawMap`).
      setRawMap(songId, rawMap);
      setHydratedFor(songId);
    })();
    /* eslint-enable react-hooks/set-state-in-effect */
    return () => {
      cancelled = true;
    };
  }, [songId, sources, setRawMap]);

  const hydrated = hydratedFor === songId;
  // Not known yet until BOTH the hydration effect above has completed and the
  // song's row has settled — a loading row is never read as "no such song" (a
  // not-found flash on a deep link whose hydration beat the read).
  if (!hydrated) return { status: "pending" };
  return resolveRow(song);
}

/**
 * The player surface. The pane's OWN header carries the whole player bar: the
 * song title is the pane title (an inline-editable node, since it needs the
 * loaded row), and ← Library, the display picker, transport, volume and the jog
 * wheel are contributions to `sonataPlayerPane.Actions` — which side of the row
 * each lands on is the slot's reorder config. The surface body is the
 * `Sonata.Transport` strip (body top), the active display
 * (`Sonata.Display.Dispatch`), and the collapsible `SectionPane`.
 */
function SonataPlayerSurface(): ReactElement {
  const { songId } = sonataPlayerPane.useParams();
  const {
    score,
    tempoScale,
    effectiveDisplayId,
    setCurrentSong,
    clearCurrentSong,
  } = useSonata();

  // Mark this song open on mount (once per open — each open is a fresh
  // `mode:"root"` instance, so this fires exactly once and bumps `songOpenEpoch`).
  // Clear on unmount so library-state effects don't mis-attribute playback. Only
  // the bare id is marked open: the title is library-owned (`songLibrary`), so
  // there is nothing to seed here.
  useEffect(() => {
    setCurrentSong(songId);
    return () => clearCurrentSong();
    // Re-run only when the song id changes; `setCurrentSong`/`clearCurrentSong`
    // are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songId]);

  return (
    // The player bar IS the pane header — one slot, title included. The
    // full-width Transport progress strip stays OUT of it, in the body top (the
    // first child below), and the display + Section panels fill the rest. The
    // body is a single `h-full` column under the chrome's inert `PaneScroll`.
    <PaneChrome pane={sonataPlayerPane}>
      <Column
        fill
        scrollBody={false}
        className="h-full bg-background text-foreground"
        header={
          /* Transport strip: full-width progression bar (and future transport
             widgets). Renders nothing when no contributor is present. */
          <Sonata.Transport.Render>
            {(t) => <t.component key={t.id} />}
          </Sonata.Transport.Render>
        }
        body={
          /* Main area: the active display + free-floating Section panels. */
          <Stack direction="row" gap="none" align="stretch" className="h-full">
            <Clip fill>
              {effectiveDisplayId ? (
                <Sonata.Display.Dispatch
                  score={score}
                  // Displays scale geometry by this to cancel the scale folded into
                  // `score`; floor it so a frozen 0% (which scales `score` by the
                  // same floor) cancels to a finite layout instead of NaN.
                  tempoScale={Math.max(tempoScale, TEMPO_MATH_FLOOR)}
                  activeDisplayId={effectiveDisplayId}
                />
              ) : (
                <Center className="h-full p-2xl">
                  <Text as="div" variant="body" tone="muted">
                    No display selected.
                  </Text>
                </Center>
              )}
            </Clip>

            {/* Free-floating panels (current-chord readout, controls, …),
                collapsible to a thin rail. */}
            <SectionPane />
          </Stack>
        }
      />
    </PaneChrome>
  );
}
