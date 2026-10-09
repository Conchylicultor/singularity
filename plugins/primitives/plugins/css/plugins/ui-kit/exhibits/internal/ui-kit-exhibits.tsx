import {
  appExhibit,
  regionExhibit,
  type Exhibit,
} from "@plugins/plugin-meta/plugins/exhibits/core";
import { OverlayPanel } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";

// ── The overlay panel as a rail region ──────────────────────────────
//
// `OverlayPanel` is THE floating surface — every popover, menu, listbox, caret
// surface and dialog in the app is one — and its `padding` role is now literally
// a rail step (`POPOVER_PADDING` maps each role to one `rail-<step>`). So the
// panel opens the region, and its content lands on the rail by doing nothing:
// the whole `DialogContent.padded` escape was deleted on the strength of that,
// with the three flush callers switched to `rail-bleed` rows instead. This is
// the fixture that holds the claim those deletions rest on.
//
// It is also the one region in the catalog whose publisher is BORDERED, which
// is not a detail. A rail is measured from the publisher's PADDING box, so a
// harness that measured the border box would read every child of this panel one
// pixel off at every width — a delta small enough to look like a rounding
// artefact and get an epsilon widened to swallow it. Getting the origin right
// here is what keeps that epsilon at half a pixel for everyone else.
//
// `padding="md"` is the panel's own default and the role most surfaces take;
// `width="content"` (the empty class) leaves the panel a plain block, so it
// fills the swept container instead of pinning itself to one measurement and
// making the sweep measure the same box twice.
export const uiKitExhibits: Exhibit[] = [
  regionExhibit({
    id: "ui-kit/overlay-panel-region",
    label: "Overlay panel region",
    widths: [262, 420, 524],
    render: (children) => <OverlayPanel padding="md">{children}</OverlayPanel>,
  }),
  // Every kind of dropdown menu, held open — the real-app half of the Menu
  // prototype's side-by-side. An app exhibit: its icons are drawn from the
  // app's sprite sheet and its menus portal into the running page.
  appExhibit({
    id: "ui-kit/menu-sheet",
    label: "Dropdown menus",
    widths: [820, 1280],
    load: () => import("./menu-sheet"),
  }),
];
