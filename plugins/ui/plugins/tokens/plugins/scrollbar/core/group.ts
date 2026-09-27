import { defineTokenGroup } from "@plugins/ui/plugins/theme-engine/core";

/**
 * The colours of the scrollbars a theme paints: `scrollbarColor` is a CSS
 * `scrollbar-color` value — `auto` (the default: the platform's own colours,
 * so a theme that says nothing about this group changes nothing) or
 * `<thumb> <track>`.
 *
 * Only the colour is themed, never the bar. `app.css` applies it at every
 * theme-scope root as `scrollbar-color`, which Chromium honours on its NATIVE
 * scrollbar — on macOS the overlay bar: no reserved space, shown only while
 * scrolling, widening under the pointer. A page-drawn `::-webkit-scrollbar`
 * would own the width and hover look too, but Chromium lays it out as a
 * classic bar that always takes its width, so that route is closed on
 * purpose. A `transparent` track also removes the rail the overlay bar draws
 * behind its thumb while hovered.
 */
export const scrollbarGroup = defineTokenGroup("scrollbar", {
  scrollbarColor: {
    default: "auto",
    label: "Scrollbar colour (auto | <thumb> <track>)",
  },
});

export type ScrollbarTokenValues = {
  [K in keyof typeof scrollbarGroup.schema]: string;
};
