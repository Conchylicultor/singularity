import type { ConfigDescriptor } from "@plugins/config_v2/core";
import type {
  AutomationConfigFields,
  AutomationEntry,
  AutomationSettings,
} from "../../core";

/** What every settings section of the detail pane is handed. */
export interface AutomationSectionProps {
  entry: AutomationEntry;
  descriptor: ConfigDescriptor<AutomationConfigFields>;
  /** The settings its config document holds now. */
  settings: AutomationSettings;
}
