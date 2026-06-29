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
 * The single surface body that renders every open tab at once, positioning each
 * by its own per-tab {@link Placement}. There is no global arrangement mode — the
 * surface "looks like" tabs / desktop / full-app emergently from the tabs'
 * placements. The body reads the whole tab lifecycle from `useTabs()`, so the
 * host forwards no props (the empty-object contract, as before).
 */
export interface SurfaceContribution {
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
  /** Trailing tab-bar action zone (next to `+`), where the `surface` plugin
   * drops its in-strip placement control. `apps` owns only the seam; the control
   * stays plugin-owned. */
  TabBarActions: defineRenderSlot<{ component: ComponentType }>(
    "apps.tab-bar-actions",
    { docLabel: () => "Tab bar actions" },
  ),
};
