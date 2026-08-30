import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Runs } from "./internal/slots";

export { Runs } from "./internal/slots";
export type { RunKindContribution } from "./internal/slots";
export type { RunRowProps } from "./components/generic-run-row";
export { RunsDataView } from "./components/runs-data-view";
export type { RunsDataViewProps } from "./components/runs-data-view";
export { runArmFields } from "./internal/arm-fields";
export {
  armText,
  armNumber,
  armBool,
  armDate,
  armTags,
} from "./internal/arm-value";
export { formatDuration } from "./internal/format";
export { RUNS_VIEW } from "./internal/view-id";

export default {
  description:
    "The merged run surface: <RunsDataView> over the base field schema plus every arm's contributed fields, and the four seams an arm reaches it through (Runs.Kind for the label + row activation, Runs.Row / Runs.Leading for the list row, Runs.Fields for its own columns). Presentation is dispatched per kind; the schema never is, so filter / sort / group-by mean one thing across every ledger.",
  slots: Runs,
} satisfies PluginDefinition;
