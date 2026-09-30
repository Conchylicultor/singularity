// Web-safe: the entry vocabulary, the live values and the Run now contract.
// Registering a provider and serving the catalog is `server/`.
export {
  BackgroundEntryDraftSchema,
  BackgroundEntrySchema,
  BackgroundFactSchema,
  BackgroundHistorySchema,
  BackgroundRecentRunsSchema,
  BackgroundRunOutcomeSchema,
  BackgroundRunSchema,
  BackgroundScopeSchema,
  BackgroundTriggerSchema,
  RECENT_RUNS_MAX,
  backgroundEntryKey,
} from "./internal/entry";
export type {
  BackgroundEntry,
  BackgroundEntryDraft,
  BackgroundFact,
  BackgroundHistory,
  BackgroundRecentRuns,
  BackgroundRun,
  BackgroundRunOutcome,
  BackgroundScope,
  BackgroundTrigger,
} from "./internal/entry";
export {
  backgroundCatalog,
  backgroundCentralCatalog,
  backgroundCentralRecentRuns,
  backgroundRecentRuns,
  runBackgroundNowEndpoint,
} from "./internal/resources";
