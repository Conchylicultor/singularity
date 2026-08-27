import { defineSlot } from "@plugins/framework/plugins/web-sdk/core";
import type { ComponentType } from "react";
import type { CodeClaim, CodeResolver } from "./claim";
import type { ActiveDataInlineContribution } from "./internal/inline-registry";

// The `display:"inline"` arm is declared — and can ONLY be built — in
// `./internal/inline-registry`, whose factory records the chip in the module
// registry every headless reader uses. Re-exported here so the union below and
// the plugin barrel name one type; see that module for why the two halves are
// sealed together.
export { inlineChip } from "./internal/inline-registry";
export type {
  ActiveDataInlineContribution,
  ChipSurface,
} from "./internal/inline-registry";

export interface ActiveDataBlockContribution {
  display: "block";
  tag: string;
  component: ComponentType<{
    content: string;
    attrs: Record<string, string>;
  }>;
}

/**
 * Like "inline" but only applied inside backtick-wrapped inline code elements,
 * never to regular text nodes. Use for tokens that are valid identifiers in prose
 * (e.g. plugin names, commit shas) but should only link when explicitly wrapped in
 * code.
 *
 * A code contribution has TWO gates, and they are separate on purpose:
 *
 * - `pattern` — the SYNTACTIC gate. Must match the full code text (no substring
 *   matching). Cheap, synchronous, and *not* sufficient: several contributions
 *   legitimately full-match the same token (a short sha is also a valid plugin
 *   name).
 * - `resolver` — the SEMANTIC gate. `useClaim(text)` answers pending / declined /
 *   claimed; only a claim reaches `component`. Build it with `codeTag()` — the
 *   host arbitrates a chain of syntactic candidates by asking each in turn, so
 *   which contribution wins is decided by who can actually resolve the token, not
 *   by plugin load order.
 *
 * There is no `attrs`: a code contribution is reached from an inline code span,
 * which carries no attributes (it was permanently `{}`). `inline`/`block` keep it,
 * where it is real.
 */
export interface ActiveDataCodeContribution {
  display: "code";
  /** Chain key + doc label. Must be unique across code contributions. */
  id: string;
  /** SYNTACTIC gate only — see above. */
  pattern: RegExp;
  /** SEMANTIC gate — always build via {@link codeTag}. */
  resolver: CodeResolver<unknown>;
}

/**
 * The one sanctioned way to build a `display:"code"` contribution, and the single
 * erasure site for its value type.
 *
 * SOUNDNESS. `CodeResolver<T>` is invariant in `T` (`useClaim` produces it,
 * `component` consumes it), so the contribution union cannot name the contributor's
 * `T` and the erasure to `CodeResolver<unknown>` is not a subtype relation TS will
 * grant. It is nevertheless sound *for this registry* because the pair is sealed
 * together here and the host never breaks it apart: the chain calls
 * `resolver.component` with exactly the value that the SAME object's
 * `resolver.useClaim` returned, and with nothing else. No other value of type
 * `unknown` can reach the component, so the contravariant half is never exercised
 * at a wider type than it was written for.
 */
export function codeTag<T>(spec: {
  id: string;
  pattern: RegExp;
  useClaim: (text: string) => CodeClaim<T>;
  component: ComponentType<{ content: string; value: T }>;
}): ActiveDataCodeContribution {
  return {
    display: "code",
    id: spec.id,
    pattern: spec.pattern,
    resolver: {
      useClaim: spec.useClaim,
      component: spec.component,
      // See SOUNDNESS above — the pair is sealed here and only ever used together.
    } as unknown as CodeResolver<unknown>,
  };
}

export type ActiveDataContribution =
  | ActiveDataBlockContribution
  | ActiveDataInlineContribution
  | ActiveDataCodeContribution;

export const ActiveData = {
  Tag: defineSlot<ActiveDataContribution>({
    docLabel: (p) => (p.display === "block" ? p.tag : p.id),
  }),
};
