import { appExhibit } from "@plugins/plugin-meta/plugins/exhibits/core";

// An app exhibit: the rows come from every field type's contributed
// `Fields.Sample` and renderer, which only the running app has.
export default [
  appExhibit({
    id: "config/field-gallery",
    label: "Config fields — every field type",
    widths: [480, 720, 1024],
    load: () => import("./internal/field-gallery"),
  }),
];
