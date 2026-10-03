import { appExhibit } from "@plugins/plugin-meta/plugins/exhibits/core";

// App exhibits: the composer's launch-option pills and prose actions are slot
// contributions and its URL default is config, so both need the running app.
export default [
  appExhibit({
    id: "task-draft/composer",
    label: "Task composer (Improve)",
    widths: [360, 480, 640, 900],
    load: () => import("./internal/composer"),
  }),
  appExhibit({
    id: "task-draft/form",
    label: "Task draft form (Improve popover)",
    // The form is a fixed 480px column; these frame it with and without room.
    widths: [480, 640],
    load: () => import("./internal/form"),
  }),
];
