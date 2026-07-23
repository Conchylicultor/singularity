import type { ComponentType } from "react";
import { defineRenderSlot } from "@plugins/primitives/plugins/slot-render/web";
import { definePaneToolbar } from "@plugins/primitives/plugins/pane-toolbar/web";

/**
 * The shared site header, rendered as the pane header (`chrome.header`) of
 * EVERY website pane so the nav persists across landing / pillars / downloads.
 * Start hosts the wordmark (contributed by the shell); section plugins
 * contribute their nav links into End (use `<WebsiteNavLink/>` for the
 * standard look).
 */
export const WebsiteToolbar = definePaneToolbar("website.toolbar");

export const Website = {
  /**
   * Landing-page sections, rendered top-to-bottom on the index pane at
   * `/website` (hero, features, demos, CTA…). Order via the standard
   * contribution `order`; each section owns its full-width band.
   */
  Section: defineRenderSlot<{ label: string; component: ComponentType }>(
    "website.section",
    { docLabel: (p) => p.label },
  ),
};
