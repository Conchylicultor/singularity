export {
  AutomationEntrySchema,
  AutomationSourceSchema,
  AutomationTriggerSchema,
  PromptVariableSchema,
} from "./internal/entry";
export type {
  AutomationEntry,
  AutomationSource,
  AutomationTrigger,
} from "./internal/entry";
export {
  AutomationSettingsSchema,
  ScheduleSettingsSchema,
  CADENCES,
  CADENCE_LABELS,
  PUSH_POLICIES,
  PUSH_POLICY_LABELS,
  SETTLE_MAX_WAIT_FACTOR,
  TRIGGER_KINDS,
  TRIGGER_KIND_LABELS,
  WEEKDAYS,
  WEEKDAY_LABELS,
  labeledOptions,
} from "./internal/settings";
export type {
  AutomationSettings,
  Cadence,
  PushPolicy,
  ScheduleSettings,
  TriggerKind,
  Weekday,
} from "./internal/settings";
export {
  AUTOMATIONS_CONFIG_PLUGIN_ID,
  automationModelField,
  defineAutomationConfig,
  readAutomationSettings,
} from "./internal/config";
export type {
  AutomationConfigDefaults,
  AutomationConfigFields,
} from "./internal/config";
export { cadenceCron, cadenceWords } from "./internal/cadence";
export type { CadenceCron } from "./internal/cadence";
export {
  PUSH_POLICY_TEXT,
  PUSH_POLICY_VARIABLE,
  renderPrompt,
  templateVariables,
  unknownTemplateVariables,
} from "./internal/template";
export type { PromptVariable, RenderedPrompt } from "./internal/template";
export {
  automationsCatalog,
  automationTasks,
  AutomationTaskRowSchema,
  taskOriginShape,
} from "./internal/resources";
export type { AutomationTaskRow } from "./internal/resources";
export { automationsRoute, automationDetailRoute } from "./internal/routes";
