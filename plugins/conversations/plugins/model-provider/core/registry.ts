import { z } from "zod";

export const ConversationModelSchema = z.enum([
  "opus-4-8",
  "opus-4-7",
  "opus-4-6",
  "sonnet-4-6",
]);
export type ConversationModel = z.infer<typeof ConversationModelSchema>;

export const DEFAULT_MODEL: ConversationModel = "opus-4-8";

export type ModelMeta = {
  cliFlag: string;
  label: string;
  family: "opus" | "sonnet";
  iconSize: string;
  /** Older versions hidden from the dropdown by default. */
  defaultHidden?: boolean;
};

export const MODEL_REGISTRY: Record<ConversationModel, ModelMeta> = {
  "opus-4-8": { cliFlag: "claude-opus-4-8", label: "Opus 4.8", family: "opus", iconSize: "size-4" },
  "opus-4-7": { cliFlag: "claude-opus-4-7", label: "Opus 4.7", family: "opus", iconSize: "size-4", defaultHidden: true },
  "opus-4-6": { cliFlag: "claude-opus-4-6", label: "Opus 4.6", family: "opus", iconSize: "size-4", defaultHidden: true },
  "sonnet-4-6": { cliFlag: "claude-sonnet-4-6", label: "Sonnet 4.6", family: "sonnet", iconSize: "size-3" },
};

// Back-compat: rows written before flattening stored "opus"/"sonnet".
const LEGACY_ALIASES: Record<string, ConversationModel> = {
  opus: "opus-4-6", // 4-6 was the pre-versioning default
  sonnet: "sonnet-4-6",
};

/**
 * Boundary guard for any *stored* model string read back from the DB or config.
 * Legacy ("opus"/"sonnet") and unknown values normalize to a valid concrete model.
 */
export function normalizeModel(stored: string): ConversationModel {
  if (stored in MODEL_REGISTRY) return stored as ConversationModel;
  return LEGACY_ALIASES[stored] ?? DEFAULT_MODEL;
}
