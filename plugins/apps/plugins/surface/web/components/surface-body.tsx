import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  TabSurface,
  useTabs,
  registerPlacementCapabilities,
  type Tab,
} from "@plugins/apps/web";
import {
  CHROME_THEME_SCOPE,
  PortalThemeScopeProvider,
} from "@plugins/primitives/plugins/ui-kit/web";
import { ScopedAppTheme } from "@plugins/ui/plugins/theme-engine/web";
import {
  Surface,
  PlacementStyleProvider,
  type PlacementDef,
  type PlacementStyleApi,
} from "../slots";

/**
 * The single surface body that renders EVERY open tab at once and positions each
 * by its own per-tab placement. There is no global arrangement mode — the surface
 * looks however the active placements paint it (docked tabs full-bleed, floating
 * windows over a backdrop, a solo tab full-app). Contributed into `Apps.Surface`;
 * mounted inside `TabsProvider`, so it reads `useTabs()` directly.
 *
 * This body is GENERIC: it names no specific placement. Every placement (docked /
 * floating / solo …) is a self-contained sub-plugin contributing one
 * {@link PlacementDef} to the `Surface.Placement` registry; this dispatcher
 * resolves each tab through the matching descriptor and varies only data
 * (class / portal / chrome / backdrop). One stable container per tab whose parent
 * chain never changes across placement transitions keeps each `TabSurface`
 * mounted (Chrome-style keep-alive).
 */
export function SurfaceBody() {
  const { tabs, focusedTabId, focusTab, closeTab, setPlacement, titles } =
    useTabs();

  const defs = Surface.Placement.useContributions();
  const sorted = useMemo(
    () => [...defs].sort((a, b) => a.order - b.order),
    [defs],
  );
  const byId = useMemo(() => {
    const m = new Map<string, PlacementDef>();
    for (const d of sorted) m.set(d.id, d);
    return m;
  }, [sorted]);
  const defaultId = useMemo(
    () => sorted.find((d) => d.default)?.id ?? sorted[0]?.id ?? "",
    [sorted],
  );

  // Publish the derived capabilities to the apps-owned registry so apps-side
  // chrome (tab bar `+`, drag-out, theme scope, use-tabs default) can read them
  // back without ever importing or naming a specific placement. Direction stays
  // surface → apps (apps never imports surface).
  useMemo(
    () =>
      registerPlacementCapabilities({
        defaultId,
        tearOffId: sorted.find((d) => d.tearOffTarget)?.id,
        newTabFollows: new Set(
          sorted.filter((d) => d.newTabFollows).map((d) => d.id),
        ),
        appThemeScope: new Set(
          sorted.filter((d) => d.themeScope === "app").map((d) => d.id),
        ),
      }),
    [sorted, defaultId],
  );

  // One scoped theme `<style>` per DISTINCT app, so each tab's inline content
  // adopts its own app's palette (two tabs of the same app share one block, keyed
  // on app id). Each tab container is tagged `data-theme-scope="app:<id>"`; the
  // backdrop itself wears the chrome scope so chrome/portals keep the global theme.
  const appIds = useMemo(() => [...new Set(tabs.map((t) => t.appId))], [tabs]);

  // Resolve a tab's placement id, falling back to the default for unknown ids.
  const resolveId = (placement: string) =>
    byId.has(placement) ? placement : defaultId;

  // Backdrops: render each placement's optional `Backdrop` once iff at least one
  // open tab resolves to it (replaces the old `desktopMode` wallpaper rule).
  const backdrops = sorted.filter(
    (d) => d.Backdrop && tabs.some((t) => resolveId(t.placement) === d.id),
  );

  return (
    // The shared backdrop for all placements. `transform-gpu` makes it the
    // containing block for the absolutely-positioned tabs (and their fixed-position
    // app chrome), so docked/floating tabs are clipped to the surface below the
    // tab bar. (Solo tabs escape via `position: fixed` + portalToBody.)
    <div
      data-theme-scope={CHROME_THEME_SCOPE}
      className="relative h-full w-full overflow-hidden bg-background transform-gpu"
    >
      {/* Per-placement backdrops (e.g. floating's desktop wallpaper), rendered
          only while >= 1 tab uses that placement so they never bleed otherwise. */}
      {backdrops.map((d) => {
        const Backdrop = d.Backdrop!;
        return <Backdrop key={d.id} />;
      })}
      {appIds.map((id) => (
        <ScopedAppTheme key={id} appId={id} />
      ))}
      {tabs.map((tab) => (
        <TabContainer
          key={tab.tabId}
          def={byId.get(tab.placement) ?? byId.get(defaultId)}
          defaultId={defaultId}
          tab={tab}
          focused={tab.tabId === focusedTabId}
          title={titles[tab.tabId]}
          onFocus={() => focusTab(tab.tabId)}
          onClose={() => closeTab(tab.tabId)}
          setPlacement={setPlacement}
        />
      ))}
    </div>
  );
}

interface TabContainerProps {
  /** The resolved placement descriptor for this tab (undefined => empty registry). */
  def: PlacementDef | undefined;
  /** The registry default placement id (for self-heal + exit-to-default). */
  defaultId: string;
  tab: Tab;
  focused: boolean;
  title: string | undefined;
  onFocus: () => void;
  onClose: () => void;
  setPlacement: (tabId: string, placement: string) => void;
}

/**
 * One tab's stable keep-alive container. The container `<div>` and the content
 * inset → `PortalThemeScopeProvider` → `TabSurface` chain are byte-identical
 * across every placement, so a placement change re-positions the still-mounted
 * tab rather than remounting it. Only the container's class / inline style / the
 * presence of a sibling `Chrome` overlay change.
 *
 * The active placement's optional `Chrome` is a SIBLING overlay (never a parent
 * of `TabSurface`). It pushes dynamic inline style (floating's geometry box /
 * inset) and a raise-to-front pointer handler up to this container via the
 * keep-alive style channel ({@link PlacementStyleApi}); on unmount its cleanup
 * clears them, so docked / solo fall back to the static defaults.
 */
function TabContainer({
  def,
  defaultId,
  tab,
  focused,
  title,
  onFocus,
  onClose,
  setPlacement,
}: TabContainerProps) {
  // Dynamic style pushed by the active placement's `Chrome` (null for static
  // placements like docked / solo). These are the keep-alive override channel.
  const [overrideStyle, setOverrideStyle] = useState<CSSProperties | null>(null);
  const [insetStyle, setInsetStyle] = useState<CSSProperties | null>(null);
  const [pointerDownCapture, setPointerDownCapture] = useState<
    ((e: PointerEvent) => void) | null
  >(null);

  // Stable style channel for the active `Chrome`. The setter for the pointer
  // handler stores the function itself (not a state-updater), so we wrap it.
  const styleApi = useMemo<PlacementStyleApi>(
    () => ({
      setContainerStyle: (s) => setOverrideStyle(s),
      setContentInsetStyle: (s) => setInsetStyle(s),
      setContainerPointerDownCapture: (h) => setPointerDownCapture(() => h),
    }),
    [],
  );

  // Self-heal: an unknown persisted placement (its sub-plugin was removed) renders
  // under the default; rewrite `tab.placement` once so it persists correctly.
  useEffect(() => {
    if (!def && defaultId) setPlacement(tab.tabId, defaultId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot heal keyed on the missing def
  }, [def, defaultId, tab.tabId]);

  // Empty registry (no placement plugins): fall back to a built-in docked-like
  // full-area container so the app stays usable. The control renders nothing.
  const fallback = !def;
  const containerClassName = def
    ? def.containerClassName
    : "absolute inset-0 bg-background";
  const visibleWhenUnfocused = def?.visibleWhenUnfocused ?? false;
  const portalToBody = def?.portalToBody ?? false;
  const Chrome = def?.Chrome;

  // Hidden tabs stay mounted (keep-alive): only the visibility gate changes.
  // `visibleWhenUnfocused` placements (floating windows) stay painted unfocused.
  const visible = visibleWhenUnfocused || focused;

  // The host ALWAYS owns focus-on-pointerdown (harmless for every placement);
  // the active placement may ADD behavior (floating's raise-to-front) via the
  // registered `pointerDownCapture`, composed after the base focus.
  const onContainerPointerDownCapture = (e: PointerEvent) => {
    onFocus();
    pointerDownCapture?.(e);
  };

  const container = (
    <div
      onPointerDownCapture={onContainerPointerDownCapture}
      // Tags this tab's subtree so the matching `ScopedAppTheme` block themes its
      // inline content with this app's palette. Portaled descendants escape this
      // attribute, so they re-adopt the theme via the PortalThemeScopeProvider
      // wrapping TabSurface below.
      data-theme-scope={`app:${tab.appId}`}
      className={containerClassName}
      style={
        fallback
          ? { display: focused ? "block" : "none" }
          : { display: visible ? "block" : "none", ...overrideStyle }
      }
    >
      {/* Stable content inset: ALWAYS present so `TabSurface`'s parent chain is
          identical in every placement. Only its CSS changes (pushed by the active
          Chrome — e.g. floating's titlebar inset / minimized hide). The
          PortalThemeScopeProvider is ALSO always present (stable scope per tab),
          so it never remounts TabSurface (keep-alive). */}
      <div
        className="absolute inset-0 min-h-0 min-w-0 transform-gpu"
        style={insetStyle ?? undefined}
      >
        <PortalThemeScopeProvider scope={`app:${tab.appId}`}>
          <TabSurface tab={tab} />
        </PortalThemeScopeProvider>
      </div>

      {/* Active placement's optional sibling Chrome overlay (never a parent of
          TabSurface). Mounted only when the placement provides one; on unmount its
          cleanup clears any pushed style so the container falls back to defaults. */}
      {Chrome && (
        <PlacementStyleProvider value={styleApi}>
          <Chrome
            tabId={tab.tabId}
            appId={tab.appId}
            title={title}
            focused={focused}
            onClose={onClose}
            onExitToDefault={() => setPlacement(tab.tabId, defaultId)}
          />
        </PlacementStyleProvider>
      )}
    </div>
  );

  // `portalToBody` placements (solo) portal their container to `document.body` so
  // a `fixed inset-0` box is relative to the VIEWPORT, not the `transform-gpu`
  // backdrop (which would otherwise contain it below the tab bar / right of the
  // rail). `createPortal` only moves the DOM node — the React tree position is
  // unchanged, so `TabSurface` keeps its state across the transition (keep-alive).
  return portalToBody ? createPortal(container, document.body) : container;
}
