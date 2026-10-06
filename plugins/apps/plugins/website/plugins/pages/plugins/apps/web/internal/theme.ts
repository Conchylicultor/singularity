import { both, defineSubTheme } from "@plugins/ui/plugins/theme-engine/core";
import { typeScaleGroup } from "@plugins/ui/plugins/tokens/plugins/type-scale/core";
import { densityGroup } from "@plugins/ui/plugins/tokens/plugins/density/core";
import { shapeGroup } from "@plugins/ui/plugins/tokens/plugins/shape/core";

/**
 * The gallery's sizes, worn by the chips and the app cards over the site's
 * `equin-document`. A catalogue is read up close, card by card, so it sets in a
 * smaller hand than the site's essay pages. Each role re-valued here is the one
 * the gallery's text already speaks through:
 *
 * - `heading` 20px/1.55 — a group's name.
 * - `subheading` 16px/1.55 — an app's name.
 * - `body` 14px/1.5 — what an app does; a group's line.
 * - `caption` 13.5px/1.55 — a category chip (a `ToggleChip` reads `caption`).
 * - `label` 12.5px/1.55 — the category line under an app's name.
 * - `control` 12.5px/1.55 — Install.
 * - `tag` 10.5px/1.55 — the Soon badge.
 *
 * The rhythm inside a card and between cards (8 / 12 / 14 / 16px), the card's
 * 18px inset, the chip and Install heights and paddings, and a 10px radius step
 * that puts the card corner (`rounded-2xl`, 1.8×) on 18px.
 */
export const equinGalleryTheme = defineSubTheme({
  id: "equin-gallery",
  label: "equin gallery",
  fragments: [
    typeScaleGroup.fragment(
      both({
        fontSizeHeading: "1.25rem",
        lineHeightHeading: "1.9375rem",
        fontSizeSubheading: "1rem",
        lineHeightSubheading: "1.55rem",
        fontSizeBody: "0.875rem",
        lineHeightBody: "1.3125rem",
        fontSizeCaption: "0.84375rem",
        lineHeightCaption: "1.3078125rem",
        fontSizeLabel: "0.78125rem",
        lineHeightLabel: "1.2109375rem",
        fontSizeControl: "0.78125rem",
        lineHeightControl: "1.2109375rem",
        fontSizeTag: "0.65625rem",
        lineHeightTag: "1.0171875rem",
        // A chip's words keep their badge's `font-tag` weight under the
        // chip's own size: medium, stated so a surrounding theme's heavier tag
        // weight does not reach the gallery.
        fontWeightTag: "500",
      }),
    ),
    densityGroup.fragment(
      both({
        // 18px — a card's inset.
        padCard: "1.125rem",
        // The Soon badge: 2px × 7px.
        padChipX: "0.4375rem",
        padChipY: "0.125rem",
        // A category chip (`control-sm`): 13.5px on its 1.55 line, 6px above
        // and below, a 1px border — and 8px + the pill extra = 14px inline.
        controlHeightSm: "2.1828125rem",
        controlPadSm: "0.5rem",
        // Install (`control-md`): 12.5px on its line, 5px above and below, a
        // 1px border — and 7px + the pill extra = 13px inline.
        controlHeightMd: "1.9609375rem",
        controlPadMd: "0.4375rem",
        // 8px — between two chips.
        "space-xs": "0.5rem",
        // 12px — a group's name and its line.
        "space-sm": "0.75rem",
        // 14px — an app's tile and its name; the name and what it does.
        "space-md": "0.875rem",
        // 16px — between two cards; a group's head and its grid; a card's
        // picture, words and Install.
        "space-lg": "1rem",
      }),
    ),
    shapeGroup.fragment(both({ radius: "0.625rem" })),
  ],
});

/**
 * The page's end — "Missing an app?" and the two read-next cards — over the
 * site's `equin-document`: a 20px heading, 15px running text, a 19px question
 * on a tight 1.35 line, the 42px field (`control-sm`, its 14px text on the
 * `caption` role) beside the 44px Build it (`control-md`, 14px `control`, 18px
 * inline), 14px field padding, and a 10px radius step (the field and the
 * button at 10px, the dashed card's `rounded-3xl` at 22px).
 */
export const equinClosingTheme = defineSubTheme({
  id: "equin-closing",
  label: "equin closing",
  fragments: [
    typeScaleGroup.fragment(
      both({
        fontSizeHeading: "1.25rem",
        lineHeightHeading: "1.9375rem",
        fontSizeSubheading: "1.1875rem",
        lineHeightSubheading: "1.603125rem",
        fontSizeBody: "0.9375rem",
        lineHeightBody: "1.453125rem",
        fontSizeCaption: "0.875rem",
        lineHeightCaption: "1.35625rem",
        fontSizeControl: "0.875rem",
        lineHeightControl: "1.35625rem",
      }),
    ),
    densityGroup.fragment(
      both({
        controlHeightSm: "2.625rem",
        controlHeightMd: "2.73125rem",
        controlPadMd: "1.125rem",
        // 4px — the heading and its line.
        "space-2xs": "0.25rem",
        // 8px — the field and Build it.
        "space-xs": "0.5rem",
        // 14px — a field's inline padding; a question and its link.
        "space-sm": "0.875rem",
        "space-md": "0.875rem",
        // 16px — between the two read-next cards.
        "space-lg": "1rem",
      }),
    ),
    shapeGroup.fragment(both({ radius: "0.625rem" })),
  ],
});
