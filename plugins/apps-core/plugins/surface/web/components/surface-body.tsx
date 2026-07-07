import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { TabSurface } from "@plugins/apps-core/plugins/tab-surface/web";
import {
  useTabs,
  registerPlacementCapabilities,
  type Tab,
} from "@plugins/apps-core/plugins/tabs/web";
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
  const { tabs, focusedTabId, focusTab, closeTab, mode, exitToPreviousMode, titles } =
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
  // chrome (tab bar `+`, theme scope, use-tabs default) can read them back
  // without ever importing or naming a specific mode. Direction stays
  // surface → apps (apps never imports surface).
  useEffect(() => {
    registerPlacementCapabilities({
      defaultId,
      ids: new Set(sorted.map((d) => d.id)),
      newTabFollows: new Set(
        sorted.filter((d) => d.newTabFollows).map((d) => d.id),
      ),
      appThemeScope: new Set(
        sorted.filter((d) => d.themeScope === "app").map((d) => d.id),
      ),
    });
  }, [sorted, defaultId]);

  // The ONE active mode descriptor: the surface renders EVERY tab under it.
  // Resolve the stored mode id to a registered descriptor, falling back to the
  // default for the pre-registration "" seed or a removed mode sub-plugin. This
  // single value is why two modes can never be visible at once — there is no
  // per-tab placement to disagree with it.
  const activeDef = byId.get(mode) ?? byId.get(defaultId);

  // Exit-presence layer (view-only): the live tabs plus any just-closed tab,
  // retained so the active mode's Chrome can play an exit tween (only when the
  // mode declares an `exitDurationMs`, e.g. windows) before the host truly
  // unmounts it. Drives the render loop so a closing window animates out.
  const presence = useTabPresence(tabs, activeDef);

  // Backdrop / Foreground belong to the ONE active mode (e.g. windows' wallpaper
  // + dock). A mode without them (docked / solo) paints neither, so switching to
  // solo instantly drops the desktop wallpaper and window dock — no leak.
  const Backdrop = activeDef?.Backdrop;
  const Foreground = activeDef?.Foreground;

  return (
    // The shared backdrop for all modes. `transform-gpu` makes it the containing
    // block for the absolutely-positioned tabs (and their fixed-position app
    // chrome), so docked/floating tabs are clipped to the surface below the tab
    // bar. (Solo tabs escape via `position: fixed` + portalToBody.) No
    // `data-theme-scope` here — the backdrop inherits the desktop `:root` theme.
    // Each forked app's scope block is mounted centrally (theme-engine's
    // AppScopeThemes at Core.Root); each tab container is still tagged
    // `data-theme-scope="app:<id>"` to pick it up.
    <Clip className="relative h-full w-full bg-background transform-gpu">
      {/* The active mode's optional backdrop (e.g. windows' desktop wallpaper). */}
      {Backdrop && <Backdrop />}
      {presence.map((p) => (
        <TabContainer
          key={p.tab.tabId}
          def={activeDef}
          tab={p.tab}
          focused={p.tab.tabId === focusedTabId}
          exiting={p.exiting}
          title={titles[p.tab.tabId]}
          onFocus={() => focusTab(p.tab.tabId)}
          onClose={() => closeTab(p.tab.tabId)}
          onExit={exitToPreviousMode}
        />
      ))}
      {/* The active mode's optional foreground (e.g. windows' dock), rendered last
          so it sits above the tab containers. Gets the tabIds so it stays
          decoupled from the host — in a single mode, that's all the tabs. */}
      {Foreground && (
        <Foreground
          // LIVE ids only: the dock chip disappears immediately on close, and a
          // closing window can't be cycled / docked while it animates out.
          tabIds={presence.filter((p) => !p.exiting).map((p) => p.tab.tabId)}
          // LIVE + EXITING ids: store-prune keys on this so a window is not
          // pruned out from under its still-animating Chrome.
          retainedTabIds={presence.map((p) => p.tab.tabId)}
        />
      )}
    </Clip>
  );
}

interface TabContainerProps {
  /** The ONE active surface-mode descriptor (undefined => empty registry). */
  def: PlacementDef | undefined;
  tab: Tab;
  focused: boolean;
  /** True while this tab has left the store but is retained for its exit tween. */
  exiting: boolean;
  title: string | undefined;
  onFocus: () => void;
  onClose: () => void;
  /** Return the surface to the previous mode (passed to the mode's Chrome). */
  onExit: () => void;
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
  tab,
  focused,
  exiting,
  title,
  onFocus,
  onClose,
  onExit,
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

  // Empty registry (no mode plugins): fall back to a built-in docked-like
  // full-area container so the app stays usable. The control renders nothing.
  const fallback = !def;
  const containerClassName = def
    ? def.containerClassName
    : "absolute inset-0 bg-background";
  const visibleWhenUnfocused = def?.visibleWhenUnfocused ?? false;
  const portalToBody = def?.portalToBody ?? false;
  const Chrome = def?.Chrome;

  // Every tab stays mounted (keep-alive); only the visibility gate changes. A
  // mode that paints all tabs (`visibleWhenUnfocused`, i.e. windows) shows every
  // tab; docked / solo show only the focused one, so a non-focused tab is
  // display:none and can never overlap the visible one.
  const visible = visibleWhenUnfocused || focused;

  // The host ALWAYS owns focus-on-pointerdown (harmless for every mode); the
  // active mode may ADD behavior (windows' raise-to-front) via the registered
  // `pointerDownCapture`, composed after the base focus.
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
            onExit={onExit}
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
