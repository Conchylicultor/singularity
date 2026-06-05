import type { ComponentType } from "react";
import { defineRenderSlot } from "@plugins/primitives/plugins/slot-render/web";

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
  }>("apps.app", {
    docLabel: (p) => p.tooltip,
  }),
};
