import { useEffect, useLayoutEffect, useMemo } from "react";
import { useScopeMembership } from "@plugins/config_v2/web";
import { useActiveApp, Apps } from "@plugins/apps-core/web";
import { useRootThemeScope } from "@plugins/apps-core/plugins/theme-scope/web";
import {
  appThemeScope,
  subThemeScope,
  themeScopeSelectors,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import {
  useConfiguredColorMode,
  useResolvedColorMode,
  type ColorMode,
} from "../use-color-mode";
import { ThemeEngine } from "../slots";
import type { TokenGroupContribution } from "../slots";
import {
  useResolvedTheme,
  type ResolvedThemeState,
} from "../use-resolved-theme";
import {
  themeSelectionConfig,
  type ColorAdjustment,
  type GroupValues,
  type SubTheme,
  type TokenGroupFragment,
  type TokenValues,
} from "../../core";
import { transformValues } from "../internal/transform";
import { renderGroupBlock } from "../internal/serialize-vars";
import {
  themeResolutionReportSink,
  type ThemeResolutionFault,
} from "../internal/resolution-report-sink";
import {
  claimPaintStyle,
  releasePaintStyle,
  reportPaintStyle,
  setPaintContext,
} from "../internal/paint-cache-aggregator";

// styleId for a token group's <style>, shared by the runtime injector, the
// localStorage cache, and the pre-paint replay script (web-core/index.html).
const styleIdFor = (groupId: string) => `theme-engine-${groupId}`;

function assertComplete(
  group: TokenGroupContribution,
  light: Record<string, string>,
  dark: Record<string, string>,
): void {
  const keys = Object.keys(group.descriptor.schema);
  const missingIn = (values: Record<string, string>) =>
    keys.filter((k) => values[k] === undefined || values[k] === "");
  const missingLight = missingIn(light);
  const missingDark = missingIn(dark);
  if (missingLight.length === 0 && missingDark.length === 0) return;
  const parts: string[] = [];
  if (missingLight.length) parts.push(`light: ${missingLight.join(", ")}`);
  if (missingDark.length) parts.push(`dark: ${missingDark.join(", ")}`);
  throw new Error(
    `Token group "${group.id}" produced incomplete values after merge — ` +
      `missing/empty schema keys (${parts.join("; ")}). Every declared token ` +
      `must resolve in both modes; check the group's schema defaults.`,
  );
}

function GroupStyle({
  group,
  values,
  colorAdjust,
  scopeToken,
}: {
  group: TokenGroupContribution;
  // This group's resolved values, or null while the scope's theme is still
  // pending (a resident theme source or the selection loading).
  values: GroupValues | null;
  colorAdjust: ColorAdjustment | null;
  // When set, this GroupStyle emits a *scoped* override block targeting
  // `[data-theme-scope="<scopeToken>"]` instead of global `:root`/`.dark` (e.g.
  // `"app:home"` for one app with its own theme). Scoped blocks use a distinct
  // `theme-scope-` style id; both scoped and unscoped blocks feed the pre-paint
  // cache aggregator so a warm reload paints every visible surface (the desktop
  // `:root` + each such app's scope) on frame 0.
  scopeToken?: string;
}) {
  // Resolve straight to the final CSS text (null while the theme is pending).
  // The DOM effects below depend on this STRING, not on the value objects:
  // upstream hooks rebuild their objects across renders, and object-identity
  // deps made the effect re-run — remove + re-append its <style> — on every
  // boot commit. That churn (~64 elements per commit) let mid-task style
  // recalcs observe a theme-less document, which retriggered `transition-*` on
  // themed elements over and over: the visible "flicker until boot settles"
  // bug. A string dep makes no-op re-renders structurally unable to touch the DOM.
  const text = useMemo(() => {
    if (values === null || colorAdjust === null) return null;
    // Loud completeness backstop: every declared token var must resolve in
    // both modes. With schema defaults as the resolver's base this never fires
    // for a sparse theme (by construction) — it catches developer bugs: an
    // empty schema `default`.
    assertComplete(group, values.light, values.dark);
    return renderGroupBlock(
      group.descriptor,
      transformValues(values.light, colorAdjust),
      transformValues(values.dark, colorAdjust),
      scopeToken ? themeScopeSelectors(scopeToken) : undefined,
    );
  }, [values, colorAdjust, group, scopeToken]);

  // Scoped overrides get a distinct `theme-scope-` id; the global path keeps the
  // `theme-engine-` id the pre-paint replay and cache rely on. Both id families
  // feed the aggregator and the claim-based prune set.
  usePaintedStyle(
    scopeToken ? scopedStyleIdFor(scopeToken, group.id) : styleIdFor(group.id),
    text,
  );
  return null;
}

// styleId for a scoped block — an app scope's or a sub-theme's. The
// `theme-scope-` prefix is what the prune pass and the pre-paint replay match.
const scopedStyleIdFor = (scopeToken: string, groupId: string) =>
  `theme-scope-${scopeToken}-${groupId}`;

/**
 * One painted `<style>` element: `text` in the document and in the pre-paint
 * cache, under `id`. `null` text (a theme still loading) leaves whatever is
 * there — the CSS replayed before first paint — untouched.
 */
function usePaintedStyle(id: string, text: string | null): void {
  // Element lifecycle — runs once per id, NOT on theme changes. Adopts the
  // replay-injected element in place (by id) or creates it, and claims the id
  // so the prune pass keeps it. Claiming here (even while the theme is still
  // pending) also protects the replayed pre-paint CSS from a prune triggered by
  // an already-resolved sibling. The element is only removed on unmount —
  // never as part of a content update.
  useLayoutEffect(() => {
    let el = document.getElementById(id) as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement("style");
      el.id = id;
      document.head.appendChild(el);
    }
    claimPaintStyle(id);
    return () => {
      el.remove();
      releasePaintStyle(id);
      reportPaintStyle(id, null);
    };
  }, [id]);

  // Content update — writes textContent in place only when the rendered CSS
  // actually changed, and feeds the pre-paint cache. Runs after the lifecycle
  // effect above (same commit, declaration order), so the element exists. While
  // `text` is null (theme pending) it leaves the replayed pre-paint CSS
  // untouched — painting a guess here would overwrite it with wrong values for
  // one window.
  useLayoutEffect(() => {
    if (text === null) return;
    const el = document.getElementById(id);
    if (el && el.textContent !== text) el.textContent = text;
    reportPaintStyle(id, text);
  }, [id, text]);
}

/**
 * One scope's painted blocks: a GroupStyle per registered token group, all fed
 * from ONE resolution of the scope's theme, plus the reports for anything that
 * resolution could not paint as stored.
 */
function ScopeStyles({
  scopeId,
  scopeToken,
}: {
  scopeId: string | undefined;
  scopeToken?: string;
}) {
  const groups = ThemeEngine.TokenGroup.useContributions();
  const state = useResolvedTheme(scopeId);
  useReportResolutionFaults(scopeId, state);

  return (
    <>
      {groups.map((g) => (
        <GroupStyle
          key={g.id}
          group={g}
          values={state.pending ? null : state.theme.groups[g.id]!}
          colorAdjust={state.pending ? null : state.theme.colorAdjust}
          scopeToken={scopeToken}
        />
      ))}
    </>
  );
}

/**
 * A missing theme or dropped stored values are never silent: each distinct
 * fault is reported once per mount. Keyed on a string so a re-render with the
 * same faults reports nothing new.
 */
function useReportResolutionFaults(
  scopeId: string | undefined,
  state: ResolvedThemeState,
): void {
  const faults: ThemeResolutionFault[] = [];
  if (!state.pending) {
    if (state.missing !== undefined) {
      faults.push({ kind: "missing-theme", scopeId, themeId: state.missing });
    }
    for (const skipped of state.skipped) {
      faults.push(
        skipped.reason === "unregistered-group"
          ? {
              kind: "unregistered-group",
              themeId: skipped.themeId,
              groupId: skipped.groupId,
            }
          : {
              kind: "unknown-tokens",
              themeId: skipped.themeId,
              groupId: skipped.groupId,
              tokens: skipped.tokens,
            },
      );
    }
  }
  useReportFaults(faults);
}

/** Report each distinct fault once per mount. */
function useReportFaults(faults: ThemeResolutionFault[]): void {
  const faultsKey = JSON.stringify(faults);

  useEffect(() => {
    for (const fault of JSON.parse(faultsKey) as ThemeResolutionFault[]) {
      themeResolutionReportSink.emit(fault);
    }
  }, [faultsKey]);
}

// Toggles the single global `<html>.dark` class from the desktop (global,
// unscoped) resolved color mode. Color mode is a single global class — no
// per-app DOM scoping (per-scope dark is deferred) — and now follows the
// desktop config, so switching the focused app never flips light/dark. The
// resolution itself lives in useResolvedColorMode so the class and prop-themed
// components never drift.
function ColorModeApplier({ resolved }: { resolved: ColorMode }) {
  useLayoutEffect(() => {
    document.documentElement.classList.toggle("dark", resolved === "dark");
  }, [resolved]);

  return null;
}

export function ThemeInjector() {
  // "Base layer owns `:root`": `:root` carries the FOCUSED full-surface app's
  // theme. `useRootThemeScope()` returns `app:<id>` when the focused placement is
  // `themeScope:"app"` (docked/solo) and an app is active, else `undefined`
  // (desktop/floating → global). The chrome surfaces (rail, tab bar, toaster)
  // share this exact definition via `useChromeThemeScope`, so they can never
  // disagree about which app owns the surface.
  const rootScopeId = useRootThemeScope();
  const rootIsGlobal = rootScopeId === undefined;

  // The active app's path — the pre-paint cache key (one app is loaded per page).
  const appPath = useActiveApp()?.app.basePath;

  // Color mode is NOT scoped like the token values are: the `:root` tokens follow
  // `rootScopeId` (the focused app), but `<html>.dark` is a single global class.
  // Both reads below therefore go through use-color-mode, which names the owning
  // scope once — neither takes one. That is load-bearing here: the cache is a
  // PREDICTION of the class, replayed before React can apply it, so a cached mode
  // read at a different scope than `resolved` paints the wrong scheme for the
  // whole load. (It did: an app configured `light` under a global `dark` gave a
  // white first frame that flipped to dark on mount.)
  const resolved = useResolvedColorMode();
  // The CONFIGURED mode (not the resolved light/dark) is what the cache stores, so
  // the pre-paint script can re-resolve "system" against live matchMedia each
  // load — an OS appearance flip between sessions still paints the right scheme.
  const colorMode = useConfiguredColorMode();

  // Feed the active paint context to the module-level aggregator, which collects
  // EVERY GroupStyle's CSS text (the `:root`/`.dark` blocks plus every other
  // visible app's scope) and writes the per-app-path localStorage envelope the
  // pre-paint script in web-core/index.html replays before first paint — so a
  // warm reload paints every visible surface themed on frame 0. The aggregator
  // owns the debounced microtask flush and the claim-based stale-element prune
  // (both global and scoped ids). The context is set in the render body (not an
  // effect) so it is current before the flush microtask. `rootIsGlobal` keys the
  // `""` (global) cache entry: only a global focus owns it; a full-surface app
  // focus writes only its own app-path key. See paint-cache-aggregator/theme-cache.
  setPaintContext({ appPath, mode: colorMode, rootIsGlobal });

  // The `:root`/`.dark` blocks paint the FOCUSED full-surface app's theme
  // (`rootScopeId`) — the base layer, always emitted. A root scope without its
  // own theme document resolves to the desktop's choice (config_v2 falls back
  // to the base document). Other simultaneously-visible apps with their own
  // theme add a scoped override block via AppScopeThemes below.
  return (
    <>
      <ColorModeApplier resolved={resolved} />
      <ScopeStyles scopeId={rootScopeId} />
    </>
  );
}

// Scoped sibling of ThemeInjector for a single app id, for an app that is NOT the
// one currently owning `:root`. A scoped override block targeting
// `[data-theme-scope="app:<id>"]` lets a second simultaneously-visible surface (an
// unfocused docked tab, a floating window, a portaled solo) show ITS app's theme
// while `:root` keeps the focused app's (or desktop) theme.
//
// Two gates suppress all needless blocks:
//  - Whole-app root gate: when `appThemeScope(appId) === rootScopeId`, this app's
//    theme is ALREADY `:root`, so it emits nothing — no redundant scoped block.
//  - Ownership gate: ONE check per scope, on the theme selection document. An app
//    with its own theme document emits blocks for every group; an app without one
//    emits nothing and inherits `:root` whole (it cannot own part of a theme).
// Combined, the common single-docked-app case (only the focused app visible, which
// owns `:root`) emits ZERO scoped blocks.
//
// It reuses the same resolution, color adjustment and completeness backstop as
// the `:root` path (all live in ScopeStyles / GroupStyle) — only the selector and
// style id differ (via `scopeToken`). Its GroupStyles feed the pre-paint cache
// aggregator (under their `theme-scope-app:<id>-<group>` ids) just like the
// `:root` path, so a warm reload paints this app's scope on frame 0. Deliberately
// omits ColorModeApplier (light/dark stays global).
//
// Mounted centrally (one per registered app via AppScopeThemes at Core.Root),
// not per open surface — so the degraded `AppTabsBody` fallback and the real
// surface share the same scope blocks, with no `apps → theme-engine` cycle.
export function ScopedAppTheme({
  appId,
  rootScopeId,
}: {
  appId: string;
  rootScopeId: string | undefined;
}) {
  const scopeId = appThemeScope(appId);
  const ownsTheme = useScopeMembership(themeSelectionConfig, scopeId);
  // Hooks above run unconditionally (Rules of Hooks); only the emitted tree
  // branches — unmounting the blocks removes their <style> elements.
  if (!ownsTheme || scopeId === rootScopeId) return null;
  return <ScopeStyles scopeId={scopeId} scopeToken={scopeId} />;
}

// Central mount point for every registered app's scope block: one
// <ScopedAppTheme/> per `Apps.App` contribution. The app currently owning `:root`
// (the focused full-surface app) is skipped per-instance via `rootScopeId`, and
// every other app emits only when it owns a theme — so the common
// single-docked-app case emits nothing. Mounted at Core.Root — slot
// `useContributions()` is provider-free, so this needs no TabsProvider ancestor
// (which is exactly why it can't hang off `useTabs`). Mounting centrally (rather
// than per open surface) is what lets the degraded `AppTabsBody` fallback be
// themed without an `apps → theme-engine` import cycle.
export function AppScopeThemes() {
  const apps = Apps.App.useContributions();
  const rootScopeId = useRootThemeScope();
  return (
    <>
      {apps.map((app) => (
        <ScopedAppTheme key={app.id} appId={app.id} rootScopeId={rootScopeId} />
      ))}
    </>
  );
}

/**
 * Every contributed sub-theme's blocks: one `<style>` per fragment, targeting
 * `[data-theme-scope="sub:<id>"]` and holding ONLY the tokens that fragment
 * names. Everything else inside a sub-theme region reads the surrounding theme
 * by plain CSS inheritance — which is why a sub-theme is resolved against
 * nothing and never needs to know which theme it sits in.
 *
 * Painted for as long as a sub-theme is contributed, not when a region wearing
 * it mounts: the blocks are a handful of variables, and always being there puts
 * them in the pre-paint cache, so a region never shows one frame in the
 * surrounding theme's values before its own.
 */
export function SubThemeStyles() {
  const subThemes = ThemeEngine.SubTheme.useContributions();
  const groups = ThemeEngine.TokenGroup.useContributions();
  const groupsById = new Map(groups.map((g) => [g.id, g]));

  const seen = new Set<string>();
  const faults: ThemeResolutionFault[] = [];
  const blocks: {
    subTheme: SubTheme;
    group: TokenGroupContribution;
    fragment: TokenGroupFragment;
  }[] = [];
  for (const subTheme of subThemes) {
    if (seen.has(subTheme.id)) {
      throw new Error(
        `[theme-engine] two sub-themes claim the id "${subTheme.id}" — sub-theme ids must be unique.`,
      );
    }
    seen.add(subTheme.id);
    for (const fragment of subTheme.fragments) {
      const group = groupsById.get(fragment.groupId);
      if (!group) {
        faults.push({
          kind: "unregistered-group",
          themeId: subTheme.id,
          groupId: fragment.groupId,
        });
        continue;
      }
      const unknown = Object.keys(fragment.light).filter(
        (token) => !Object.hasOwn(group.descriptor.schema, token),
      );
      if (unknown.length > 0) {
        faults.push({
          kind: "unknown-tokens",
          themeId: subTheme.id,
          groupId: group.id,
          tokens: unknown,
        });
      }
      blocks.push({ subTheme, group, fragment });
    }
  }
  useReportFaults(faults);

  return (
    <>
      {blocks.map(({ subTheme, group, fragment }) => (
        <SubThemeFragmentStyle
          key={`${subTheme.id}-${group.id}`}
          subTheme={subTheme}
          group={group}
          fragment={fragment}
        />
      ))}
    </>
  );
}

function SubThemeFragmentStyle({
  subTheme,
  group,
  fragment,
}: {
  subTheme: SubTheme;
  group: TokenGroupContribution;
  fragment: TokenGroupFragment;
}) {
  const scopeToken = subThemeScope(subTheme);
  const text = useMemo(
    () =>
      renderGroupBlock(
        group.descriptor,
        definedValues(fragment.light),
        definedValues(fragment.dark),
        themeScopeSelectors(scopeToken),
      ),
    [group, fragment, scopeToken],
  );
  usePaintedStyle(scopedStyleIdFor(scopeToken, group.id), text);
  return null;
}

function definedValues(values: TokenValues): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [token, value] of Object.entries(values)) {
    if (value !== undefined) out[token] = value;
  }
  return out;
}
