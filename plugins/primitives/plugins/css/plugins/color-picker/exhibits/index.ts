import { appExhibit } from "@plugins/plugin-meta/plugins/exhibits/core";

// An app exhibit, not an isolated one: the picker's Recent row is a live read
// (primitives/usage-rank), which only the running app serves.
export default [
  appExhibit({
    id: "color-picker/picker",
    label:
      "Color picker — named suggestions, default, with and without opacity",
    widths: [320, 640],
    load: () => import("./internal/color-picker-exhibit"),
  }),
];
