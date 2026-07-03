import type { ComponentType } from "react";
import { defineSlot } from "@plugins/framework/plugins/web-sdk/core";
import { defineRenderSlot } from "@plugins/primitives/plugins/slot-render/web";
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

export const Apps = {
  App: defineRenderSlot<{
    /** The app's canonical serializable icon descriptor (see {@link AppIcon}). */
    icon: AppIcon;
    tooltip: string;
    component: ComponentType;
    path: string;
    onClick?: () => void;
    /** Marks this app as the fallback when the URL matches no app and on initial boot. */
    default?: boolean;
    /** Optional overlay rendered on the app's rail icon (e.g. an attention
     * dot). Painted at the icon's top-right corner; render `null` when there's
     * nothing to surface so the corner stays empty. */
    badge?: ComponentType<{ className?: string }>;
  }>("apps.app", {
    docLabel: (p) => p.tooltip,
  }),
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
