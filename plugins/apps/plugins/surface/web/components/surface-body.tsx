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
import { PortalThemeScopeProvider } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Clip } from "@plugins/primitives/plugins/css/plugins/clip/web";
import {
  Surface,
  PlacementStyleProvider,
  type PlacementDef,
  type PlacementStyleApi,
} from "../slots";
import { useTabPresence } from "../internal/use-tab-presence";

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

  // Heal any tab whose stored placement isn't a registered id back to the
  // default. A tab seeded before this registry populated stores "" as its
  // placement (apps' `getDefaultPlacement()` returns "" until `surface`
  // registers), and a removed placement sub-plugin leaves dangling ids. The
  // surface RENDERS such tabs under the default (resolveId below), but the raw
  // `tab.placement` must also be made canonical: other consumers read it
  // unresolved — the focused-placement store and, through it, the app-theme
  // chrome scope (`useChromeThemeScope` → `placementHasAppThemeScope`). Without
  // this, a freshly-seeded docked tab leaves chrome (rail / tab bar) on the
  // global theme instead of the focused app's. Resolution lives here because the
  // surface owns the placement registry; apps just stores whatever it's told.
  // The setPlacement no-op guard (same value) makes this idempotent — it fires
  // once per unknown placement, never loops.
  useEffect(() => {
    if (!defaultId) return;
    for (const tab of tabs) {
      if (!byId.has(tab.placement)) setPlacement(tab.tabId, defaultId);
    }
  }, [tabs, byId, defaultId, setPlacement]);

  // Resolve a tab's placement id, falling back to the default for unknown ids.
  const resolveId = (placement: string) =>
    byId.has(placement) ? placement : defaultId;

  // Exit-presence layer (view-only): the live tabs plus any just-closed tab whose
  // placement declares an `exitDurationMs`, retained so its Chrome can play an
  // exit tween before the host truly unmounts it. Placements without the duration
  // (docked / solo) keep their tabs instant. Drives the backdrop / foreground
  // gates and the render loop below so wallpaper + window survive the tween.
  const presence = useTabPresence(tabs, byId, defaultId);

  // Backdrops: render each placement's optional `Backdrop` once iff at least one
  // retained tab resolves to it (replaces the old `desktopMode` wallpaper rule).
  // Keyed on `presence` (not `tabs`) so the wallpaper survives a closing window's
  // exit tween rather than blinking out the instant the last window leaves the store.
  const backdrops = sorted.filter(
    (d) => d.Backdrop && presence.some((p) => resolveId(p.tab.placement) === d.id),
  );

  // Foregrounds: the symmetric overlay above all containers — each placement's
  // optional `Foreground` rendered once iff at least one retained tab resolves to
  // it (e.g. floating's desktop dock). Stays generic: passes the resolved tabIds so
  // the foreground never re-derives placement (e.g. floating's window dock).
  const foregrounds = sorted.filter(
    (d) => d.Foreground && presence.some((p) => resolveId(p.tab.placement) === d.id),
  );

  return (
    // The shared backdrop for all placements. `transform-gpu` makes it the
    // containing block for the absolutely-positioned tabs (and their fixed-position
    // app chrome), so docked/floating tabs are clipped to the surface below the
    // tab bar. (Solo tabs escape via `position: fixed` + portalToBody.) No
    // `data-theme-scope` here — the backdrop inherits the desktop `:root` theme.
    // Each forked app's scope block is mounted centrally (theme-engine's
    // AppScopeThemes at Core.Root); each tab container is still tagged
    // `data-theme-scope="app:<id>"` to pick it up.
    <Clip className="relative h-full w-full bg-background transform-gpu">
      {/* Per-placement backdrops (e.g. floating's desktop wallpaper), rendered
          only while >= 1 tab uses that placement so they never bleed otherwise. */}
      {backdrops.map((d) => {
        const Backdrop = d.Backdrop!;
        return <Backdrop key={d.id} />;
      })}
      {presence.map((p) => (
        <TabContainer
          key={p.tab.tabId}
          def={byId.get(p.tab.placement) ?? byId.get(defaultId)}
          defaultId={defaultId}
          tab={p.tab}
          focused={p.tab.tabId === focusedTabId}
          exiting={p.exiting}
          title={titles[p.tab.tabId]}
          onFocus={() => focusTab(p.tab.tabId)}
          onClose={() => closeTab(p.tab.tabId)}
          setPlacement={setPlacement}
        />
      ))}
      {/* Per-placement foregrounds (e.g. floating's window dock), rendered last so
          they sit above the tab containers, only while >= 1 tab uses that
          placement. Each gets the tabIds resolving to it so it stays decoupled
          from the host's placement-resolution. */}
      {foregrounds.map((d) => {
        const Foreground = d.Foreground!;
        const forThis = presence.filter(
          (p) => resolveId(p.tab.placement) === d.id,
        );
        return (
          <Foreground
            key={d.id}
            // LIVE ids only: the dock chip disappears immediately on close, and a
            // closing window can't be cycled / docked while it animates out.
            tabIds={forThis
              .filter((p) => !p.exiting)
              .map((p) => p.tab.tabId)}
            // LIVE + EXITING ids: store-prune keys on this so a window is not
            // pruned out from under its still-animating Chrome.
            retainedTabIds={forThis.map((p) => p.tab.tabId)}
          />
        );
      })}
    </Clip>
  );
}

interface TabContainerProps {
  /** The resolved placement descriptor for this tab (undefined => empty registry). */
  def: PlacementDef | undefined;
  /** The registry default placement id (for self-heal + exit-to-default). */
  defaultId: string;
  tab: Tab;
  focused: boolean;
  /** True while this tab has left the store but is retained for its exit tween. */
  exiting: boolean;
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
  exiting,
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

  // Unknown / empty placements are healed to the default canonically by
  // SurfaceBody (it owns the registry), so `tab.placement` is always a
  // registered id by the time this renders — no per-container self-heal needed.

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
        // eslint-disable-next-line layout/no-adhoc-layout -- stable keep-alive content inset: always-present full-bleed layer whose CSS the active placement's Chrome pushes via insetStyle (titlebar inset / minimized hide); its parent-chain identity must not change, so no wrapping primitive
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
            exiting={exiting}
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
