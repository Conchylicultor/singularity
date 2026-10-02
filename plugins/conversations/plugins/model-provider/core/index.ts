// Ids, families and choices: pure functions of the id (no catalog).
export {
  ConversationModelSchema,
  ModelChoiceSchema,
  DEFAULT_MODEL_CHOICE,
  MODEL_TIERS,
  SELECTABLE_FAMILIES,
  cliFlagFor,
  choiceFamily,
  compareModelsNewestFirst,
  choiceIconSize,
  choiceLabel,
  isModelFamily,
  isPrintOnlyFamily,
  modelDisplayLabel,
  modelIdFromCliName,
  modelMeta,
  parseModelId,
} from "./registry";
export type {
  ConversationModel,
  ModelChoice,
  ModelIdParse,
  ModelMeta,
  ModelTier,
} from "./registry";

// The catalog: its shape, the baseline floor, and the readers that take it explicitly.
export {
  BASELINE_MODELS,
  FALLBACK_MODEL,
  ModelCatalogSchema,
  ModelUnavailableError,
  ModelVersionSchema,
  assertChoiceLaunchable,
  choiceHint,
  isRetired,
  requireModel,
  resolveModel,
  selectableChoices,
  unavailableMessage,
} from "./catalog";
export type { ModelCatalog, ModelResolution, ModelVersion } from "./catalog";
export { modelCatalog } from "./resources";

// Which choices the pickers show, and how a settings option is labelled.
export {
  choiceOptionLabel,
  isChoiceVisible,
  isShownByDefault,
  visibleChoices,
} from "./visibility";
export type { VisibleModelsSetting } from "./visibility";

// Stored values: tolerant of unknown-but-well-formed ids, loud on malformed ones.
export {
  StoredModelChoiceSchema,
  StoredModelSchema,
  normalizeModel,
  normalizeModelChoice,
  registerModelCorruptionReporter,
} from "./stored";
