// The updater contract, the gate comparison and the upgrade task's text. The
// runner itself (gates that spawn `./singularity check` / `test`) is CLI
// machinery, in this plugin's `cli/` barrel.
export type {
  Move,
  Outdated,
  Updater,
  UpdaterHold,
  UpdaterSmoke,
} from "./internal/updater";
export type { GateResult } from "./internal/compare";
export {
  upgradeTaskDescription,
  upgradeTaskTitle,
} from "./internal/upgrade-prompt";
