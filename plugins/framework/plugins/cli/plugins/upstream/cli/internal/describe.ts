import type { UpstreamStatus } from "@plugins/upstream/core";

/**
 * Why there is no upstream, in one sentence. Shared by both verbs so the two
 * cannot describe the same clone differently — they only differ in what they
 * do about it (`status` exits 0, `merge` refuses).
 */
export function noUpstreamSentence(
  reason: Extract<UpstreamStatus, { kind: "no-upstream" }>["reason"],
): string {
  return reason === "is-publisher"
    ? "No upstream: this checkout publishes to its own remote, so it IS the upstream — there is nothing above it to receive from."
    : "No upstream: this checkout has no git remote, so there is nowhere to receive updates from.";
}
