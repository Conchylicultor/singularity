import type { ComponentType } from "react";
import { defineRenderSlot } from "@plugins/primitives/plugins/slot-render/web";
import { definePaneHeaderSlot } from "@plugins/primitives/plugins/pane/web";

/**
 * The shared site header — ONE pane header slot worn by every INNER website
 * pane, so the nav persists across the two question pages and is authored in
 * one place: one contribution list, one reorder directive, one `⋯`.
 *
 * A pane borrows it with `Pane.define({ actions: WebsiteHeader })`; its
 * `pane.Actions` then IS this slot. It is declared exactly ONCE, by this plugin
 * (`slots: { header: WebsiteHeader }`), and the borrowing panes are deliberately
 * absent from their own plugins' `slots:` records — declaring one slot under two
 * names is what the declaration pass rejects.
 *
 * The landing pane is the one page that does NOT borrow it (see `panes.tsx`):
 * the homepage carries no nav, so it keeps the private header slot
 * `Pane.define` minted for it, and this plugin declares that pane too.
 *
 * The shell contributes the wordmark; page plugins contribute their nav links
 * (use `<WebsiteNavLink/>` for the standard look). Which of them lead and which
 * trail is the slot's reorder config, not a field on the contribution.
 */
export const WebsiteHeader = definePaneHeaderSlot();

export const Website = {
  /**
   * Landing-page sections, rendered top-to-bottom on the index pane at
   * `/website` (the intro, then the fork). Order via the slot's reorder
   * config; each section owns its full-width band.
   */
  Section: defineRenderSlot<{ label: string; component: ComponentType }>({
    docLabel: (p) => p.label,
  }),
};
