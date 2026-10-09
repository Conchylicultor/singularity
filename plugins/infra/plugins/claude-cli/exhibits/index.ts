import { appExhibit } from "@plugins/plugin-meta/plugins/exhibits/core";

// App exhibits: the detail renders its source context's ids (`task-…`,
// `conv-…`) as the registered id chips, which are slot contributions — so it
// needs the running app. 520 is the Debug detail pane's declared width.
export default [
  appExhibit({
    id: "claude-cli/call-detail",
    label: "Claude CLI call detail (succeeded)",
    widths: [360, 520],
    load: () => import("./internal/succeeded"),
  }),
  appExhibit({
    id: "claude-cli/call-detail-failed",
    label: "Claude CLI call detail (failed)",
    widths: [360, 520],
    load: () => import("./internal/failed"),
  }),
];
