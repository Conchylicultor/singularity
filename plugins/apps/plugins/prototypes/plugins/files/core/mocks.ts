/**
 * The `<meta name="mocks">` declaration, parsed.
 *
 * A prototype names the real app thing it is a mockup OF as `<kind>:<ref>` —
 * `fixture:control-panel/setting-rail` (a layout-harness fixture),
 * `route:/agents/c/123` (the running app at a route). The kind decides which
 * surface can put the two side by side, and the ref is that surface's own
 * business.
 *
 * SYNTAX ONLY. The kind set is open — each kind is a web plugin contributed
 * through a slot — so this cannot, and must not, judge whether `tag` names a
 * kind anybody handles. "Nothing here shows a `<tag>:` counterpart" is a
 * rendering the compare surface owns; "this line is not a declaration at all"
 * is a problem with the folder, which is what this file decides.
 *
 * Three arms, not two. Collapsing `malformed` into `none` would make the
 * compare surface say "declares no counterpart" about a line the author just
 * wrote and mistyped — a claim about their file that reverses itself the moment
 * they look at the card's problem list.
 */
export type MocksDeclaration =
  | { kind: "none" }
  | { kind: "malformed"; raw: string; reason: string }
  | { kind: "declared"; tag: string; ref: string };

/** A kind is a plain lowercase identifier: letters, digits and dashes. */
const TAG_RE = /^[a-z][a-z0-9-]*$/;

/**
 * Parse the raw `content` attribute. Splits at the FIRST colon, so a ref may
 * itself contain colons (`route:/x?at=10:30`). Whitespace around either half is
 * ignored.
 */
export function parseMocks(raw: string): MocksDeclaration {
  const trimmed = raw.trim();
  if (trimmed === "") return { kind: "none" };

  const colon = trimmed.indexOf(":");
  if (colon < 0) {
    return {
      kind: "malformed",
      raw: trimmed,
      reason: 'there is no "<kind>:" prefix',
    };
  }

  const tag = trimmed.slice(0, colon).trim();
  const ref = trimmed.slice(colon + 1).trim();
  if (tag === "") {
    return {
      kind: "malformed",
      raw: trimmed,
      reason: "the kind before the colon is empty",
    };
  }
  if (ref === "") {
    return {
      kind: "malformed",
      raw: trimmed,
      reason: "there is nothing after the colon",
    };
  }
  if (!TAG_RE.test(tag)) {
    return {
      kind: "malformed",
      raw: trimmed,
      reason: "a kind is lowercase letters, digits and dashes",
    };
  }
  return { kind: "declared", tag, ref };
}

/**
 * The `problems[]` detail for a malformed declaration — one wording, one place.
 *
 * Kind-agnostic on purpose: this runs on the server and in the CLI, which have
 * no access to the web-side kind registry, and inventing a list here would be
 * exactly the collection/consumer leak the architecture bans. The Compare stage
 * is where the known kinds are listed, so the message points there.
 */
export function mocksProblemDetail(
  d: Extract<MocksDeclaration, { kind: "malformed" }>,
): string {
  return `<meta name="mocks" content="${d.raw}"> is malformed — ${d.reason}. Write it as "<kind>:<ref>"; the Compare stage in the Prototypes app lists the kinds this worktree knows and an example of each`;
}
