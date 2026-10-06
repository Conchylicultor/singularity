import { defineDomScope } from "@plugins/primitives/plugins/scope/plugins/dom-scope/web";

/**
 * The cell of the explorer's toolbar the folder view's DataView controls
 * (view switcher, creators, options trigger) portal into. The toolbar and the
 * tree are siblings — the controls are built inside the DataView, which sits in
 * the scrolling body — so the toolbar publishes the cell and the tree's hosted
 * frame reads it, per listing.
 */
export const ExplorerControlsSlot = defineDomScope({
  name: "file-explorer.view-controls",
  what: "the explorer toolbar cell the folder view's controls portal into, published by the listing's toolbar",
  bounds: [],
});
