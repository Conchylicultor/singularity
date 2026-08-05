import type { Staleness } from "@plugins/release/plugins/bundles/core";

/** The 7-char form every git UI uses. Short shas are for reading, never for keys. */
export function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

/**
 * How the bundle's source commit relates to HEAD, as one sentence.
 *
 * `unknown` is stated as unknown rather than softened: a dirty build, an absent
 * sha and a sha this repo has never seen are all unprovable, and "I cannot tell"
 * is the honest answer to "am I shipping current code?".
 */
export function stalenessSentence(staleness: Staleness): string {
  switch (staleness.kind) {
    case "current":
      return "Built from the current HEAD.";
    case "behind":
      return `Built ${staleness.commits} commit${staleness.commits === 1 ? "" : "s"} behind HEAD.`;
    case "diverged":
      return `Built from ${shortSha(staleness.sha)}, which is not on HEAD's history.`;
    case "unknown":
      return `Source state unknown — ${staleness.reason}.`;
  }
}

/** The short chip form of the same relation. */
export function stalenessChipLabel(staleness: Staleness): string {
  switch (staleness.kind) {
    case "current":
      return "at HEAD";
    case "behind":
      return `${staleness.commits} behind HEAD`;
    case "diverged":
      return "diverged from HEAD";
    case "unknown":
      return "vs HEAD: unknown";
  }
}
