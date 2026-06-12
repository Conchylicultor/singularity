import type { ComponentType } from "react";
import { defineSlot } from "@plugins/framework/plugins/web-sdk/core";
import { defineRenderSlot } from "@plugins/primitives/plugins/slot-render/web";
import type { RailFramingProps } from "../core";

/** One framing host that wraps the rail + app content; see RailFramingProps. */
export interface RailFramingContribution {
  component: ComponentType<RailFramingProps>;
}

export const Apps = {
  App: defineRenderSlot<{
    icon: ComponentType<{ className?: string }>;
    tooltip: string;
    component: ComponentType;
    path: string;
    onClick?: () => void;
    /** True for the app that renders the global `Shell.Toolbar` (the agent
     * manager). Surfaces that already show the toolbar set opt out of the
     * floating action bar to avoid double-mounting its buttons. */
    hostsToolbar?: boolean;
    /** The app that hosts root-relative deep-links that match no app's path
     * (e.g. `/c/:id`). The router canonicalizes such paths into this app's
     * namespace. Exactly one app should set this. */
    fallback?: boolean;
    /** Optional overlay rendered on the app's rail icon (e.g. an attention
     * dot). Painted at the icon's top-right corner; render `null` when there's
     * nothing to surface so the corner stays empty. */
    badge?: ComponentType<{ className?: string }>;
  }>("apps.app", {
    docLabel: (p) => p.tooltip,
  }),
  /** The far-left app-rail framing (rail / hidden). The active variant owns the
   * outer wrapper and the `--app-rail-width` contract the sidebar reads. */
  RailFraming: defineSlot<RailFramingContribution>("apps.rail-framing", {
    docLabel: () => "Rail framing",
  }),
};
