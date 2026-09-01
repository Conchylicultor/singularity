import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Runs } from "./internal/slots";

export { Runs } from "./internal/slots";
export type { RunKindContribution, RunRowProps } from "./internal/slots";
export { RunsDataView } from "./components/runs-data-view";
export type { RunsDataViewProps } from "./components/runs-data-view";
export { runArmFields } from "./internal/arm-fields";
export {
  armText,
  armNumber,
  armBool,
  armDate,
  armJson,
  armTags,
} from "./internal/arm-value";
export { useRun } from "./internal/use-run";
export type { RunRead } from "./internal/use-run";
export { formatDuration } from "./internal/format";
export { RUNS_VIEW } from "./internal/view-id";

export default {
  description:
    "The merged run surface: <RunsDataView> over the base field schema plus every arm's contributed fields, and the three seams an arm reaches it through (Runs.Kind for the label + row activation, Runs.Leading for the list row's status glyph, Runs.Fields for its own columns). Every row is a single field-driven line that obeys the view's visible fields, and a domain's detail lives in the pane its rows open — an arm contributes columns and a glyph, never a row body. Also exports useRun, the by-(kind, id) read every run-detail surface hydrates from.",
  slots: Runs,
} satisfies PluginDefinition;
