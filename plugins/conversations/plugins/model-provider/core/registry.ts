import { z } from "zod";

/** Capability tiers, ordered cheap/fast → smart. Drives filter chips and tier resolution. */
export const MODEL_TIERS = ["haiku", "sonnet", "opus", "fable"] as const;
export type ModelTier = (typeof MODEL_TIERS)[number];

/**
 * What a family contributes to every one of its versions. Families are a
 * compile-time set; only versions are discovered. A family's name is also the
 * Claude CLI alias for its current version (`--model opus`), which is how the
 * CLI's model menu names it.
 */
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

/** Picker order of the families: smartest first (the reverse of MODEL_TIERS). */
export const FAMILY_DISPLAY_ORDER: readonly ModelTier[] = [
  ...MODEL_TIERS,
].reverse();

/**
 * THE id grammar: `<family>-<major>[-<minor>]`, built from MODEL_TIERS so a
 * family added there is accepted here with no second edit.
 */
const MODEL_ID_PATTERN = new RegExp(
  `^(${MODEL_TIERS.join("|")})-(\\d+)(?:-(\\d+))?$`,
);

/**
 * A concrete, pinned model version — what a conversation actually RAN. A
 * checked format, not a closed list: a version the CLI released after this
 * code was written is still a valid id, and everything about it (flag, label,
 * family) derives from the id alone (`modelMeta`). Branded, so a family name
 * or an arbitrary string cannot stand where a concrete version is needed.
 */
export const ConversationModelSchema = z
  .string()
  .regex(MODEL_ID_PATTERN, "not a model id (<family>-<major>[-<minor>])")
  .brand<"ConversationModel">();
export type ConversationModel = z.infer<typeof ConversationModelSchema>;

export type ModelIdParse =
  { ok: true; id: ConversationModel } | { ok: false; raw: string };

/** Parse a raw string as a model id. A result: the caller decides what an unparseable value means. */
export function parseModelId(raw: string): ModelIdParse {
  const parsed = ConversationModelSchema.safeParse(raw);
  return parsed.success ? { ok: true, id: parsed.data } : { ok: false, raw };
}

/**
 * The model id a Claude CLI model name stands for: `claude-haiku-4-5-20251001`
 * → `haiku-4-5`. Strips the `claude-` prefix and a trailing `-YYYYMMDD` date
 * suffix; anything that is then not an id (an alias the CLI passed through
 * unresolved, an old `claude-3-5-sonnet` spelling) is `{ ok: false }`.
 */
export function modelIdFromCliName(name: string): ModelIdParse {
  if (!name.startsWith("claude-")) return { ok: false, raw: name };
  const stripped = name.slice("claude-".length).replace(/-\d{8}$/, "");
  const parsed = parseModelId(stripped);
  return parsed.ok ? parsed : { ok: false, raw: name };
}

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

/** Everything about a model, derived from its id alone — no catalog needed. */
export function modelMeta(id: ConversationModel): ModelMeta {
  const match = MODEL_ID_PATTERN.exec(id);
  // The brand guarantees the grammar; a miss here means a value was cast past it.
  if (!match)
    throw new Error(`[model-provider] ${JSON.stringify(id)} is not a model id`);
  const family = match[1] as ModelTier;
  const version =
    match[3] === undefined ? match[2]! : `${match[2]}.${match[3]}`;
  const meta = FAMILY_META[family];
  return {
    cliFlag: `claude-${id}`,
    family,
    version,
    label: `${meta.label} ${version}`,
    iconSize: meta.iconSize,
    ...(meta.printOnly ? { printOnly: true } : {}),
  };
}

/** id → pinned Claude CLI flag. */
export function cliFlagFor(id: ConversationModel): string {
  return modelMeta(id).cliFlag;
}

/**
 * Newest first: `opus-5-5` before `opus-5` before `opus-4-8`. Families compare
 * in display order, so sorting a mixed list groups it the way pickers show it.
 */
export function compareModelsNewestFirst(
  a: ConversationModel,
  b: ConversationModel,
): number {
  const [ma, mb] = [MODEL_ID_PATTERN.exec(a)!, MODEL_ID_PATTERN.exec(b)!];
  const familyDelta =
    FAMILY_DISPLAY_ORDER.indexOf(ma[1] as ModelTier) -
    FAMILY_DISPLAY_ORDER.indexOf(mb[1] as ModelTier);
  if (familyDelta !== 0) return familyDelta;
  const majorDelta = Number(mb[2]) - Number(ma[2]);
  if (majorDelta !== 0) return majorDelta;
  return Number(mb[3] ?? 0) - Number(ma[3] ?? 0);
}

/**
 * What the user asked for: a family ("opus" — whatever Opus is current when the
 * agent is spawned) or a pinned version ("opus-5"). Every saved preference is a
 * choice; only `resolveModel` turns one into the `ConversationModel` that runs.
 */
export const ModelChoiceSchema = z.union([
  z.enum(MODEL_TIERS),
  ConversationModelSchema,
]);
export type ModelChoice = z.infer<typeof ModelChoiceSchema>;

/** A family, so the default always follows the current version. */
export const DEFAULT_MODEL_CHOICE: ModelTier = "opus";

export function isModelFamily(choice: ModelChoice): choice is ModelTier {
  return (MODEL_TIERS as readonly string[]).includes(choice);
}

/** The family a choice belongs to. */
export function choiceFamily(choice: ModelChoice): ModelTier {
  return isModelFamily(choice) ? choice : modelMeta(choice).family;
}

/** "Opus" for a family, "Opus 5" for a pinned version. */
export function choiceLabel(choice: ModelChoice): string {
  return isModelFamily(choice)
    ? FAMILY_META[choice].label
    : modelMeta(choice).label;
}

export function choiceIconSize(choice: ModelChoice): string {
  return FAMILY_META[choiceFamily(choice)].iconSize;
}

/** Whether a family is print-only (never offered for a session). */
export function isPrintOnlyFamily(family: ModelTier): boolean {
  return FAMILY_META[family].printOnly === true;
}

/**
 * The families a session can be launched with, in picker order. Code, not
 * catalog data: a family choice is always offerable, whatever the catalog
 * says about its versions.
 */
export const SELECTABLE_FAMILIES: readonly ModelTier[] =
  FAMILY_DISPLAY_ORDER.filter((family) => !isPrintOnlyFamily(family));

/**
 * Best-effort display label for a raw model string seen in tool-call inputs
 * (Agent/Workflow), where it may be an exact CLI flag ("claude-opus-4-8"), a
 * model id ("opus-4-8"), a coarse tier ("opus"), or an unknown string.
 * Resolves to the derived label when the string is a model id ("Opus 4.8");
 * otherwise the capitalized tier ("Opus"); otherwise the raw string verbatim.
 * The label is content, so it is never CSS text-transformed at the call site.
 */
export function modelDisplayLabel(raw: string): string {
  const fromCli = modelIdFromCliName(raw);
  if (fromCli.ok) return modelMeta(fromCli.id).label;
  const asId = parseModelId(raw);
  if (asId.ok) return modelMeta(asId.id).label;
  const tier = MODEL_TIERS.find((t) => raw.includes(t));
  if (tier) return FAMILY_META[tier].label;
  return raw;
}
