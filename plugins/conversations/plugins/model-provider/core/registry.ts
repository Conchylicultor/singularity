import { z } from "zod";
import { tolerantEnum } from "@plugins/primitives/plugins/live-state/core";

/** Capability tiers, ordered cheap/fast → smart. Drives filter chips and tier resolution. */
export const MODEL_TIERS = ["haiku", "sonnet", "opus", "fable"] as const;
export type ModelTier = (typeof MODEL_TIERS)[number];

/** What a family contributes to every one of its versions. */
type FamilyMeta = {
  label: string;
  iconSize: string;
  /** Print-only families: valid persisted ids but excluded from every session picker / config option. */
  printOnly?: boolean;
};

const FAMILY_META: Record<ModelTier, FamilyMeta> = {
  fable: { label: "Fable", iconSize: "size-4" },
  opus: { label: "Opus", iconSize: "size-4" },
  sonnet: { label: "Sonnet", iconSize: "size-3" },
  haiku: { label: "Haiku", iconSize: "size-3", printOnly: true },
};

export const ConversationModelSchema = z.enum([
  "fable-5-1",
  "fable-5",
  "opus-5-5",
  "opus-5",
  "opus-4-8",
  "opus-4-7",
  "opus-4-6",
  "sonnet-5",
  "sonnet-4-6",
  "haiku-4-5",
]);
/** A concrete, pinned model version — what a conversation actually ran. */
export type ConversationModel = z.infer<typeof ConversationModelSchema>;

export type ModelMeta = {
  cliFlag: string;
  family: ModelTier;
  /** Version within the family ("5.5"): the grey hint beside a family choice. */
  version: string;
  /** `${family label} ${version}`, derived — never written by hand. */
  label: string;
  iconSize: string;
  printOnly?: boolean;
};

/**
 * Every concrete version, **newest first within each family**. That order is
 * load-bearing: a family's current version is its FIRST entry here, so
 * releasing a model is one line — add it above the version it supersedes — and
 * every family choice ("Opus") follows it with no data change.
 */
const MODEL_DEFS: Record<
  ConversationModel,
  { cliFlag: string; family: ModelTier; version: string }
> = {
  "fable-5-1": { cliFlag: "claude-fable-5-1", family: "fable", version: "5.1" },
  "fable-5": { cliFlag: "claude-fable-5", family: "fable", version: "5" },
  "opus-5-5": { cliFlag: "claude-opus-5-5", family: "opus", version: "5.5" },
  "opus-5": { cliFlag: "claude-opus-5", family: "opus", version: "5" },
  "opus-4-8": { cliFlag: "claude-opus-4-8", family: "opus", version: "4.8" },
  "opus-4-7": { cliFlag: "claude-opus-4-7", family: "opus", version: "4.7" },
  "opus-4-6": { cliFlag: "claude-opus-4-6", family: "opus", version: "4.6" },
  "sonnet-5": { cliFlag: "claude-sonnet-5", family: "sonnet", version: "5" },
  "sonnet-4-6": {
    cliFlag: "claude-sonnet-4-6",
    family: "sonnet",
    version: "4.6",
  },
  "haiku-4-5": { cliFlag: "claude-haiku-4-5", family: "haiku", version: "4.5" },
};

export const MODEL_REGISTRY = Object.fromEntries(
  Object.entries(MODEL_DEFS).map(([id, def]) => {
    const family = FAMILY_META[def.family];
    const meta: ModelMeta = {
      ...def,
      label: `${family.label} ${def.version}`,
      iconSize: family.iconSize,
      ...(family.printOnly ? { printOnly: true } : {}),
    };
    return [id, meta];
  }),
) as Record<ConversationModel, ModelMeta>;

const CONCRETE_IDS = Object.keys(MODEL_DEFS) as ConversationModel[];

/** A family's current version: its first entry in registry order. */
const CURRENT: Record<ModelTier, ConversationModel> = Object.fromEntries(
  MODEL_TIERS.map((tier) => {
    const current = CONCRETE_IDS.find((id) => MODEL_DEFS[id].family === tier);
    // A family with no version is a registry bug; fail at module load, loudly.
    if (!current)
      throw new Error(
        `[model-provider] family "${tier}" has no model in MODEL_REGISTRY`,
      );
    return [tier, current];
  }),
) as Record<ModelTier, ConversationModel>;

/**
 * What the user asked for: a family ("opus" — whatever Opus is current when the
 * agent is spawned) or a pinned version ("opus-5"). Every saved preference is a
 * choice; only `resolveModel` turns one into the `ConversationModel` that runs.
 */
export const ModelChoiceSchema = z.enum([
  ...MODEL_TIERS,
  ...ConversationModelSchema.options,
]);
export type ModelChoice = z.infer<typeof ModelChoiceSchema>;

export const DEFAULT_MODEL_CHOICE: ModelChoice = "opus";

export function isModelFamily(choice: ModelChoice): choice is ModelTier {
  return (MODEL_TIERS as readonly string[]).includes(choice);
}

/** THE one place a choice becomes the concrete version that runs. */
export function resolveModel(choice: ModelChoice): ConversationModel {
  return isModelFamily(choice) ? CURRENT[choice] : choice;
}

/** The family a choice belongs to. */
export function choiceFamily(choice: ModelChoice): ModelTier {
  return isModelFamily(choice) ? choice : MODEL_REGISTRY[choice].family;
}

/** "Opus" for a family, "Opus 5" for a pinned version. */
export function choiceLabel(choice: ModelChoice): string {
  return isModelFamily(choice)
    ? FAMILY_META[choice].label
    : MODEL_REGISTRY[choice].label;
}

/** The version a family runs today ("5.5"); none for a pinned version, whose label already names it. */
export function choiceHint(choice: ModelChoice): string | undefined {
  return isModelFamily(choice)
    ? MODEL_REGISTRY[CURRENT[choice]].version
    : undefined;
}

export function choiceIconSize(choice: ModelChoice): string {
  return FAMILY_META[choiceFamily(choice)].iconSize;
}

/**
 * Session-selectable choices — families first (registry order), then every
 * pinned version. Every user-facing model picker and the `visibleModels` config
 * toggles derive from this list. Print-only families (haiku) are valid persisted
 * ids but never session-selectable. THE single place that exclusion is applied.
 */
export const SELECTABLE_CHOICES: ModelChoice[] = [
  ...new Set(CONCRETE_IDS.map((id) => MODEL_DEFS[id].family)),
  ...CONCRETE_IDS,
].filter((choice) => !FAMILY_META[choiceFamily(choice)].printOnly);

/** Distinct raw values already reported this session — dedupe so a corrupt row
 *  pushed repeatedly over the WS doesn't spam the crash pipeline. */
const reportedCorruptModels = new Set<string>();

/** Injectable sink for corruption signals. Defaults to console.error so the signal
 *  is never silent even before a richer reporter is registered (e.g. server-side,
 *  or on the client before app startup wiring runs). The web runtime swaps this for
 *  a real crash report via registerModelCorruptionReporter(). */
let corruptionSink: (message: string, raw: unknown) => void = (message) =>
  console.error(message);

/** Install the sink that receives corrupt/unknown stored-model signals. Called once
 *  at web app startup to route corruption into the visible crash-report pipeline.
 *  Core stays zero-dep/environment-agnostic — the web runtime injects the reporter. */
export function registerModelCorruptionReporter(
  fn: (message: string, raw: unknown) => void,
): void {
  corruptionSink = fn;
}

/** Loud signal for a stored model value that is not a known id — i.e. corruption
 *  or a writer on incompatible code. The caller degrades to the default, but never
 *  silently: the bad value reaches the injected sink. Deduped per distinct raw
 *  value for the session. */
function reportUnknownModel(raw: unknown, degradedTo: string): void {
  const s = String(raw);
  if (reportedCorruptModels.has(s)) return; // already surfaced this distinct value
  reportedCorruptModels.add(s);
  corruptionSink(
    `[model] corrupt/unknown stored model ${JSON.stringify(raw)} — degraded to ${degradedTo}. Indicates a corrupt DB row or a writer on incompatible code.`,
    raw,
  );
}

/**
 * Boundary guard for a stored *concrete* model (what a conversation ran) read
 * back from the DB. An unknown value degrades to the current default version,
 * and is reported.
 */
export function normalizeModel(stored: string): ConversationModel {
  if (stored in MODEL_REGISTRY) return stored as ConversationModel;
  const fallback = resolveModel(DEFAULT_MODEL_CHOICE);
  reportUnknownModel(stored, fallback);
  return fallback;
}

/** Boundary guard for a stored *choice* (a saved preference). An unknown value degrades to the default choice, and is reported. */
export function normalizeModelChoice(stored: string): ModelChoice {
  const parsed = ModelChoiceSchema.safeParse(stored);
  if (parsed.success) return parsed.data;
  reportUnknownModel(stored, DEFAULT_MODEL_CHOICE);
  return DEFAULT_MODEL_CHOICE;
}

/**
 * THE schema for a persisted *concrete* model (conversation `model`, claude-cli
 * call `model`). Tolerant by construction: an unknown stored value normalizes
 * (and reports) instead of rejecting the whole array payload on the WS push
 * path — which would blank the entire resource. Request-input schemas (API
 * bodies) stay strict so bad input is rejected loudly.
 */
export const StoredModelSchema = tolerantEnum(
  ConversationModelSchema,
  normalizeModel,
);

/** The tolerant schema for a persisted *choice* (auto-start marker, agent, launch prompt). */
export const StoredModelChoiceSchema = tolerantEnum(
  ModelChoiceSchema,
  normalizeModelChoice,
);

/** id → pinned Claude CLI flag (the one map). */
export function cliFlagFor(id: ConversationModel): string {
  return MODEL_REGISTRY[id].cliFlag;
}

/**
 * Reverse lookup of a CLI flag name → ConversationModel id, or null.
 * Strips a trailing date suffix so "claude-opus-4-7-20250101" matches the "claude-opus-4-7" flag.
 */
export function idForCliName(name: string): ConversationModel | null {
  const stripped = name.replace(/-\d{8}$/, "");
  for (const [id, meta] of Object.entries(MODEL_REGISTRY) as [
    ConversationModel,
    ModelMeta,
  ][]) {
    if (meta.cliFlag === name || meta.cliFlag === stripped) return id;
  }
  return null;
}

/**
 * Best-effort display label for a raw model string seen in tool-call inputs
 * (Agent/Workflow), where it may be an exact CLI flag ("claude-opus-4-8"), a
 * registry id ("opus-4-8"), a coarse tier ("opus"), or an unknown string.
 * Resolves to the registry label when the exact model is known ("Opus 4.8");
 * otherwise the capitalized tier ("Opus"); otherwise the raw string verbatim.
 * The label is content, so it is never CSS text-transformed at the call site.
 */
export function modelDisplayLabel(raw: string): string {
  const id =
    idForCliName(raw) ??
    (raw in MODEL_REGISTRY ? (raw as ConversationModel) : null);
  if (id) return MODEL_REGISTRY[id].label;
  const tier = MODEL_TIERS.find((t) => raw.includes(t));
  if (tier) return FAMILY_META[tier].label;
  return raw;
}
