import { USER_CONFIG_DIR_DISPLAY } from "@plugins/infra/plugins/paths/plugins/display/core";
import type {
  ConfigConflictContext,
  ConfigConflictField,
} from "@plugins/config_v2/plugins/settings/web";

/**
 * A single serialized value never grows past this. A config value can be a whole
 * list of objects; a prompt that pastes three of them verbatim buries the one
 * question it is asking.
 */
const MAX_VALUE_CHARS = 200;

/** `JSON.stringify`, clipped — and with the absent case spelled, not printed as the literal `undefined`. */
function fmtValue(value: unknown): string {
  const json = JSON.stringify(value);
  // `JSON.stringify(undefined)` is `undefined`, not a string: the key is absent
  // from that side of the conflict, which is a fact worth stating plainly.
  if (json === undefined) return "(not set)";
  return json.length > MAX_VALUE_CHARS
    ? `${json.slice(0, MAX_VALUE_CHARS)}…`
    : json;
}

function fieldLine(field: ConfigConflictField): string {
  const suffix = field.description ? ` — ${field.description}` : "";
  return `- \`${field.key}\` — mine: \`${fmtValue(field.mine)}\`, upstream: \`${fmtValue(field.upstream)}\`${suffix}`;
}

/** A titled bullet list, or nothing at all — never a heading over an empty list. */
function section(title: string, lines: string[]): string[] {
  if (lines.length === 0) return [];
  return [`${title}\n${lines.join("\n")}`];
}

function subject(conflict: ConfigConflictContext): string {
  const scope = conflict.scopeId ? `, scope \`${conflict.scopeId}\`` : "";
  return `the **${conflict.name}** config (\`${conflict.storePath}\`${scope})`;
}

/**
 * Where the user's own config lives, and why the agent cannot fix it by editing
 * a file. The config layer is forked per worktree, so the copy an agent sees
 * inside its own checkout is NOT the one the user is looking at — an agent that
 * "fixed" the conflict by editing its own fork would report success and change
 * nothing for the user.
 */
function locationNote(conflict: ConfigConflictContext): string {
  return `My own config layer lives at \`${USER_CONFIG_DIR_DISPLAY}/<worktree>/${conflict.storePath}\` and is forked per worktree, so edits you make inside your own worktree do not change mine. Report the resolution you recommend, and fix any code-level cause in the repo.`;
}

/**
 * Turn a config conflict into the first turn of an agent task: what broke, which
 * fields disagree and how, and what the agent is being asked to decide.
 *
 * Pure and total over the context — so the prompt can be built (and tested)
 * without a popover, a draft, or a live config resource.
 */
export function buildConflictPrompt(conflict: ConfigConflictContext): string {
  const blocks: string[] =
    conflict.kind === "invalid"
      ? invalidBlocks(conflict)
      : hashBlocks(conflict);
  return blocks.join("\n\n");
}

function hashBlocks(conflict: ConfigConflictContext): string[] {
  const conflicting = conflict.fields.filter((f) => f.status === "conflict");
  const upstreamOnly = conflict.fields.filter(
    (f) => f.status === "upstream-changed",
  );

  return [
    `Resolve the config conflict on ${subject(conflict)}.`,
    "Upstream defaults for this config changed while I had my own overrides, so the app is currently running the upstream values and my overrides are parked.",
    ...section(
      "Fields we both changed (these need a decision):",
      conflicting.map(fieldLine),
    ),
    ...section(
      "Fields upstream changed that I had not touched:",
      upstreamOnly.map(fieldLine),
    ),
    locationNote(conflict),
    "Find the `defineConfig` descriptor behind this config and what changed in it recently (`git log`), then for each field above tell me whether to keep my value or take the new default, and why. If the upstream change itself looks wrong or is missing a migration, fix that at the source rather than papering over it in my config.",
  ];
}

function invalidBlocks(conflict: ConfigConflictContext): string[] {
  const issues = conflict.issues ?? [];
  const stored = conflict.fields.filter((f) => f.status !== "unchanged");

  return [
    `Resolve the invalid stored config on ${subject(conflict)}.`,
    "The stored document no longer validates against the current schema, so the app has fallen back to the code defaults and my stored values are not being used.",
    ...section(
      "Schema issues:",
      issues.map((issue) => `- \`${issue.path}\` — ${issue.message}`),
    ),
    ...section(
      "Stored values that differ from what the app runs:",
      stored.map(fieldLine),
    ),
    locationNote(conflict),
    "Find the schema change that invalidated this document — the `defineConfig` descriptor behind it and its recent history (`git log`) — then either tell me how to migrate the stored document or fix the descriptor so the stored shape still parses. If a field's type changed with no migration behind it, fix that at the source rather than asking me to retype my values.",
  ];
}

/**
 * The one-line summary the launch popover shows above the extra-context box:
 * what the agent is about to be asked, in the user's terms. Deliberately says
 * how many fields carry a DECISION rather than how many differ — the count the
 * banner itself reports, so the popover cannot contradict the banner that
 * opened it.
 */
export function describeConflict(conflict: ConfigConflictContext): string {
  if (conflict.kind === "invalid") {
    const n = conflict.issues?.length ?? 0;
    return n > 0
      ? `${conflict.storePath} no longer validates against its schema (${n} issue${n === 1 ? "" : "s"}).`
      : `${conflict.storePath} no longer validates against its schema.`;
  }
  const decisions = conflict.fields.filter((f) => f.status === "conflict");
  if (decisions.length > 0) {
    return `Upstream defaults for ${conflict.storePath} moved — ${decisions.length} field${decisions.length === 1 ? "" : "s"} need${decisions.length === 1 ? "s" : ""} a decision.`;
  }
  return `Upstream defaults for ${conflict.storePath} moved under my overrides.`;
}
