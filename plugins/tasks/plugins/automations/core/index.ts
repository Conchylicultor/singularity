export {
  AutomationEntrySchema,
  AutomationSettingsSchema,
  AutomationSourceSchema,
  AutomationTriggerSchema,
} from "./internal/entry";
export type {
  AutomationEntry,
  AutomationSettings,
  AutomationSource,
  AutomationTrigger,
} from "./internal/entry";
export {
  automationsCatalog,
  automationTasks,
  AutomationTaskRowSchema,
  taskOriginShape,
} from "./internal/resources";
export type { AutomationTaskRow } from "./internal/resources";
export { automationsRoute, automationDetailRoute } from "./internal/routes";
