import type { ComponentType } from "react";
import {
  defineSlot,
  type Contribution,
} from "@plugins/framework/plugins/web-sdk/core";
import {
  defineRenderSlot,
  type RenderSlot,
} from "@plugins/primitives/plugins/slot-render/web";
import type { AppRef } from "@plugins/primitives/plugins/pane/core";
import type { AppIcon } from "@plugins/apps-core/plugins/app-icon/core";
import type { RailFramingProps } from "../core";

/** One framing host that wraps the rail + app content; see RailFramingProps. */
export interface RailFramingContribution {
  component: ComponentType<RailFramingProps>;
}

/**
 * The single surface body that renders every open tab at once under the ONE
 * surface {@link Placement} mode (docked / windows / solo). The mode is
 * per-surface, never per-tab, so the surface "looks like" tabs / desktop /
 * full-app as a single mutually-exclusive choice — two modes can never be
 * visible at once. The body reads the whole tab lifecycle + mode from
 * `useTabs()`, so the host forwards no props (the empty-object contract).
 */
export interface SurfaceContribution {
  component: ComponentType<Record<string, never>>;
}

/** The top tab strip. A single-contribution slot (the `tab-bar` plugin); `apps`
 * renders nothing here when no contributor is present (chrome-less surface). */
export interface TabBarContribution {
  component: ComponentType<Record<string, never>>;
}

/**
 * One installed app, as its shell authors it. The app's identity — id, base
 * path, display name, icon key — is authored ONCE via `defineApp` in the
 * shell's `core/`, and handed here whole as {@link AppRef}. The contribution
 * restates none of it, so the two can never disagree.
 */
export interface AppEntry {
  /** The app itself (`defineApp(…)` from the shell's `core/app.ts`). */
  app: AppRef;
  /** The app's canonical serializable icon descriptor (see {@link AppIcon}). */
  icon: AppIcon;
  component: ComponentType;
  onClick?: () => void;
  /** Marks this app as the fallback when the URL matches no app and on initial boot. */
  default?: boolean;
  /** Optional overlay rendered on the app's rail icon (e.g. an attention
   * dot). Painted at the icon's top-right corner; render `null` when there's
   * nothing to surface so the corner stays empty. */
  badge?: ComponentType<{ className?: string }>;
}

const appSlot = defineRenderSlot<AppEntry>("apps.app", {
  docLabel: (p) => p.app.name,
});

/**
 * The `Apps.App` slot, with a call signature that accepts ONLY an
 * {@link AppEntry} — writing `id`, `path` or `tooltip` is a type error, because
 * there is nothing left to write them into.
 *
 * Declared explicitly rather than inferred from `Object.assign`: an intersection
 * of two call signatures reads as an overload set, which would let an author
 * reach the raw slot's `id`-taking signature again.
 */
export interface AppSlot {
  (entry: AppEntry): Contribution;
  id: string;
  useContributions: RenderSlot<AppEntry>["useContributions"];
  Render: RenderSlot<AppEntry>["Render"];
}

/** The contribution restates nothing about the app, so the framework-required
 *  contribution id is derived from the `AppRef` here — the one place it can be,
 *  and therefore the one value it can ever have. */
const App: AppSlot = Object.assign(
  (entry: AppEntry) => appSlot({ ...entry, id: entry.app.id }),
  {
    id: appSlot.id,
    useContributions: appSlot.useContributions,
    Render: appSlot.Render,
  },
);

export const Apps = {
  App,
  /** The far-left app-rail framing (rail / hidden). The active variant owns the
   * outer wrapper and the `--app-rail-width` var (the rail's own width); the
   * rail sits as a flex sibling of the app body. */
  RailFraming: defineSlot<RailFramingContribution>("apps.rail-framing", {
    docLabel: () => "Rail framing",
  }),
  /** The surface body that lays out every open tab by its per-tab placement. A
   * single-contribution render slot (the `surface` plugin); `apps` falls back to
   * its built-in docked-only strip when no contributor is present. */
  Surface: defineSlot<SurfaceContribution>("apps.surface", {
    docLabel: () => "Surface",
  }),
  /** The top tab strip. A single-contribution slot (the `tab-bar` plugin);
   * `apps` renders nothing here when no contributor is present (chrome-less
   * surface). Distinct from `TabBarActions` (the trailing action zone inside
   * the strip); this slot hosts the strip itself. */
  TabBar: defineSlot<TabBarContribution>("apps.tab-bar", {
    docLabel: () => "Tab bar",
  }),
  /** Trailing tab-bar action zone (next to `+`), where the `surface` plugin
   * drops its in-strip placement control. `apps` owns only the seam; the control
   * stays plugin-owned. */
  TabBarActions: defineRenderSlot<{ component: ComponentType }>(
    "apps.tab-bar-actions",
    { docLabel: () => "Tab bar actions" },
  ),
};
