import type { ComponentType } from "react";
import { defineRenderSlot } from "@plugins/primitives/plugins/slot-render/web";
import { definePaneHeaderSlot } from "@plugins/primitives/plugins/pane/web";

/**
 * The shared site header — ONE pane header slot worn by EVERY website pane, so
 * the nav persists across landing / pillars / downloads and is authored in one
 * place: one contribution list, one reorder directive, one `⋯`.
 *
 * A pane borrows it with `Pane.define({ actions: WebsiteHeader })`; its
 * `pane.Actions` then IS this slot. It is declared exactly ONCE, by this plugin
 * (`slots: { header: WebsiteHeader }`), and the borrowing panes are deliberately
 * absent from their own plugins' `slots:` records — declaring one slot under two
 * names is what the declaration pass rejects.
 *
 * The shell contributes the wordmark; section plugins contribute their nav links
 * (use `<WebsiteNavLink/>` for the standard look). Which of them lead and which
 * trail is the slot's reorder config, not a field on the contribution.
 */
export const WebsiteHeader = definePaneHeaderSlot();

export const Website = {
  /**
   * Landing-page sections, rendered top-to-bottom on the index pane at
   * `/website` (hero, features, demos, CTA…). Order via the standard
   * contribution `order`; each section owns its full-width band.
   */
  Section: defineRenderSlot<{ label: string; component: ComponentType }>({
    docLabel: (p) => p.label,
  }),
};
