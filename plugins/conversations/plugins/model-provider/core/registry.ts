import { z } from "zod";
import { tolerantEnum } from "@plugins/primitives/plugins/live-state/core";

export const ConversationModelSchema = z.enum([
  "fable-5",
  "opus-5",
  "opus-4-8",
  "opus-4-7",
  "opus-4-6",
  "sonnet-5",
  "sonnet-4-6",
  "haiku-4-5",
]);
export type ConversationModel = z.infer<typeof ConversationModelSchema>;

export const DEFAULT_MODEL: ConversationModel = "opus-5";

/** Capability tiers, ordered cheap/fast → smart. Drives filter chips and tier resolution. */
export const MODEL_TIERS = ["haiku", "sonnet", "opus", "fable"] as const;
export type ModelTier = (typeof MODEL_TIERS)[number];

export type ModelMeta = {
  cliFlag: string;
  label: string;
  family: ModelTier;
  iconSize: string;
  /** Older versions hidden from the dropdown by default. */
  defaultHidden?: boolean;
  /** Print-only models: valid persisted ids but excluded from the launch dropdown / config options. */
  printOnly?: boolean;
};

export const MODEL_REGISTRY: Record<ConversationModel, ModelMeta> = {
  "fable-5": { cliFlag: "claude-fable-5", label: "Fable 5", family: "fable", iconSize: "size-4" },
  "opus-5": { cliFlag: "claude-opus-5", label: "Opus 5", family: "opus", iconSize: "size-4" },
  "opus-4-8": { cliFlag: "claude-opus-4-8", label: "Opus 4.8", family: "opus", iconSize: "size-4", defaultHidden: true },
  "opus-4-7": { cliFlag: "claude-opus-4-7", label: "Opus 4.7", family: "opus", iconSize: "size-4", defaultHidden: true },
  "opus-4-6": { cliFlag: "claude-opus-4-6", label: "Opus 4.6", family: "opus", iconSize: "size-4", defaultHidden: true },
  "sonnet-5": { cliFlag: "claude-sonnet-5", label: "Sonnet 5", family: "sonnet", iconSize: "size-3" },
  "sonnet-4-6": { cliFlag: "claude-sonnet-4-6", label: "Sonnet 4.6", family: "sonnet", iconSize: "size-3", defaultHidden: true },
  "haiku-4-5": { cliFlag: "claude-haiku-4-5", label: "Haiku 4.5", family: "haiku", printOnly: true, iconSize: "size-3" },
};

/**
 * Session-selectable models, in registry order — every user-facing model picker
 * (launch dropdown, auto-start, task-draft, launch-prompts, agent) and the
 * `visibleModels` config toggles derive from this list. Print-only models (e.g.
 * haiku) are valid *persisted* ids but never session-selectable, so they are
 * excluded here. This is THE single place the `printOnly` exclusion is applied.
 */
export const SELECTABLE_MODELS: ConversationModel[] = (
  Object.entries(MODEL_REGISTRY) as [ConversationModel, ModelMeta][]
)
  .filter(([, meta]) => !meta.printOnly)
  .map(([id]) => id);

// Back-compat: rows written before flattening stored coarse tiers "opus"/"sonnet"/"haiku".
// "haiku" only ever reached print-only claude-cli call rows (never session-selectable).
const LEGACY_ALIASES: Record<string, ConversationModel> = {
  opus: "opus-4-6", // 4-6 was the pre-versioning default
  sonnet: "sonnet-4-6",
  haiku: "haiku-4-5",
};

/**
 * Boundary guard for any *stored* model string read back from the DB or config.
 * Legacy ("opus"/"sonnet") and unknown values normalize to a valid concrete model.
 */
export function normalizeModel(stored: string): ConversationModel {
  if (stored in MODEL_REGISTRY) return stored as ConversationModel;
  return LEGACY_ALIASES[stored] ?? DEFAULT_MODEL;
}

/** Distinct raw values already reported this session — dedupe so a corrupt row
 *  pushed repeatedly over the WS doesn't spam the crash pipeline. */
const reportedCorruptModels = new Set<string>();

/** Injectable sink for corruption signals. Defaults to console.error so the signal
 *  is never silent even before a richer reporter is registered (e.g. server-side,
 *  or on the client before app startup wiring runs). The web runtime swaps this for
 *  a real crash report via registerModelCorruptionReporter(). */
let corruptionSink: (message: string, raw: unknown) => void = (message) => console.error(message);

/** Install the sink that receives corrupt/unknown stored-model signals. Called once
 *  at web app startup to route corruption into the visible crash-report pipeline.
 *  Core stays zero-dep/environment-agnostic — the web runtime injects the reporter. */
export function registerModelCorruptionReporter(fn: (message: string, raw: unknown) => void): void {
  corruptionSink = fn;
}

/** Loud signal for a stored model value that is neither a known id nor an expected legacy alias —
 *  i.e. corruption or a writer on incompatible code. Degrades (caller normalizes to DEFAULT_MODEL)
 *  but never silently: surfaces the bad value via the injected sink instead of hiding it. Known
 *  legacy aliases stay silent. Deduped per distinct raw value for the session. */
export function reportUnknownModel(raw: unknown): void {
  const s = String(raw);
  if (s in MODEL_REGISTRY || s in LEGACY_ALIASES) return; // expected — silent
  if (reportedCorruptModels.has(s)) return; // already surfaced this distinct value
  reportedCorruptModels.add(s);
  corruptionSink(
    `[model] corrupt/unknown stored model ${JSON.stringify(raw)} — degraded to ${DEFAULT_MODEL}. Indicates a corrupt DB row or a writer on incompatible code.`,
    raw,
  );
}

/**
 * THE schema for any *persisted* model id read back through a live-state resource.
 * Tolerant by construction: a legacy/unknown stored value normalizes to a concrete
 * model (via normalizeModel) and fires a deduped crash signal (via reportUnknownModel)
 * instead of rejecting the whole array payload on the WS push path — which would blank
 * the entire resource. Use this — never the raw strict `ConversationModelSchema` — for
 * a stored model field. Request-input schemas (API bodies) stay strict so bad input is
 * rejected loudly.
 */
export const StoredModelSchema = tolerantEnum(ConversationModelSchema, normalizeModel, reportUnknownModel);

/** id → pinned Claude CLI flag (the one map). */
export function cliFlagFor(id: ConversationModel): string {
  return MODEL_REGISTRY[id].cliFlag;
}

/** The canonical (non-defaultHidden) id for a tier. Used by print callers that want "the current model of tier X". */
export function currentModelForTier(tier: ModelTier): ConversationModel {
  switch (tier) {
    case "fable":
      return "fable-5";
    case "opus":
      return "opus-5";
    case "sonnet":
      return "sonnet-5";
    case "haiku":
      return "haiku-4-5";
  }
}

/**
 * Reverse lookup of a CLI flag name → ConversationModel id, or null.
 * Strips a trailing date suffix so "claude-opus-4-7-20250101" matches the "claude-opus-4-7" flag.
 */
export function idForCliName(name: string): ConversationModel | null {
  const stripped = name.replace(/-\d{8}$/, "");
  for (const [id, meta] of Object.entries(MODEL_REGISTRY) as [ConversationModel, ModelMeta][]) {
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
  const id = idForCliName(raw) ?? (raw in MODEL_REGISTRY ? (raw as ConversationModel) : null);
  if (id) return MODEL_REGISTRY[id].label;
  const tier = MODEL_TIERS.find((t) => raw.includes(t));
  if (tier) return tier.charAt(0).toUpperCase() + tier.slice(1);
  return raw;
}
