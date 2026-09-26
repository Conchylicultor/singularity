import { defineTokenGroup } from "@plugins/ui/plugins/theme-engine/core";

/**
 * The scrollbars a theme draws.
 *
 * `scrollbarStyle` is the switch: `native` (the default) leaves every scrollbar
 * to the platform — macOS overlay bars, untouched — so a theme that says
 * nothing about this group changes nothing. `custom` draws the bar from the
 * other tokens: a `scrollbarSize` gutter holding a thumb inset
 * `scrollbarThumbInset` from its edges (a transparent border, so the visible
 * thumb is `size − 2 × inset` wide), rounded to `scrollbarRadius`, in
 * `scrollbarThumb` (`scrollbarThumbHover` under the pointer) over
 * `scrollbarTrack`.
 *
 * The switch is read by a container style query in the ui-kit's `app.css`
 * (`@container style(--scrollbar-style: custom)`): WebKit replaces the native
 * bar the moment any `::-webkit-scrollbar` rule matches, so the custom rules
 * must not match at all under `native`. The other defaults only matter once a
 * theme turns it on.
 */
export const scrollbarGroup = defineTokenGroup("scrollbar", {
  scrollbarStyle: {
    default: "native",
    label: "Scrollbar style (native | custom)",
  },
  scrollbarSize: { default: "10px", label: "Scrollbar size" },
  scrollbarThumbInset: { default: "3px", label: "Scrollbar thumb inset" },
  scrollbarRadius: { default: "9999px", label: "Scrollbar thumb radius" },
  scrollbarThumb: {
    default: "color-mix(in oklch, var(--muted-foreground) 35%, transparent)",
    label: "Scrollbar thumb",
  },
  scrollbarThumbHover: {
    default: "color-mix(in oklch, var(--muted-foreground) 55%, transparent)",
    label: "Scrollbar thumb (hover)",
  },
  scrollbarTrack: { default: "transparent", label: "Scrollbar track" },
});

export type ScrollbarTokenValues = {
  [K in keyof typeof scrollbarGroup.schema]: string;
};
