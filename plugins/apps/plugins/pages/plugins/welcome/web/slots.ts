import type { ComponentType } from "react";
import { defineRenderSlot } from "@plugins/primitives/plugins/slot-render/web";

/**
 * Extensible host for the Pages app's landing surface (shown at bare `/pages`
 * before a page is opened). Sub-plugins contribute a section component
 * (quick-create, recent pages, …) and the landing pane renders them in order.
 */
export const PagesWelcome = {
  Section: defineRenderSlot<{ component: ComponentType }>("pages.welcome.section"),
};
