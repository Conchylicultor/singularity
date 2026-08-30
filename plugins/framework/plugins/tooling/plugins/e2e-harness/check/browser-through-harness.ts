import { grepCode } from "@plugins/framework/plugins/tooling/plugins/checks/core";
import { getWorktreeRoot } from "@plugins/infra/plugins/spawn/core";
import type {
  Check,
  CheckResult,
} from "@plugins/framework/plugins/tooling/core";

/**
 * Chromium is launched through `withBrowser`, and nowhere else.
 *
 * `withBrowser` is not merely a convenience wrapper. It is where three things
 * happen that a script cannot be trusted to remember:
 *
 *  - the agent-origin headers go onto the browser context, which is what makes
 *    every page and config write the run causes attributable and revertible;
 *  - the config the run wrote is restored, at both ends (see
 *    `e2e/agent-writes.ts`);
 *  - the browser is closed, so a run does not leak a Chromium process.
 *
 * All three are guarantees about the WHOLE fleet, and each of them is only as
 * true as "there is one way into a browser". A hand-rolled `chromium.launch()`
 * silently opts out of all three at once — the resulting script still passes,
 * which is exactly what makes it worth a check rather than a convention.
 *
 * Today no script does this (verified across all 157 e2e scripts at the time
 * the ledger landed); this keeps it that way.
 *
 * Scoped to `e2e/` because that is where the guarantees apply. The harness's own
 * `browser.ts` is the one legal launch site and is excluded by path.
 */

/** `chromium.launch(...)` — the call, not a mention of it in prose. */
const OFFENDING = /\bchromium\s*\.\s*launch(Persistent\w*)?\s*\(/;

/** Same shape in POSIX ERE, for the `git grep -l` candidate pre-filter. */
const GREP_ARG = "chromium[[:space:]]*\\.[[:space:]]*launch";

/**
 * Only `e2e/` files, and never the harness's own launch site.
 *
 * A pathspec exclusion rather than an allowlist entry: the legal site is
 * identified by WHERE it is, and a second file in the harness that launched a
 * browser would be just as wrong as one anywhere else — so the exclusion names
 * the single file, not the directory.
 */
const PATHSPECS = [
  "*/e2e/*.ts",
  ":(exclude)plugins/framework/plugins/tooling/plugins/e2e-harness/e2e/browser.ts",
];

const check: Check = {
  id: "e2e-harness:browser-through-harness",
  description:
    "e2e scripts launch a browser through `withBrowser`, never `chromium.launch()` directly — the harness is where provenance, config revert, and browser close live",
  async run(): Promise<CheckResult> {
    const root = await getWorktreeRoot();
    // Comments masked, strings not — same rule as the sibling check: a docblock
    // explaining the rule (this one included) must not trip it.
    const matches = await grepCode({
      root,
      pattern: OFFENDING,
      grepArg: GREP_ARG,
      maskStrings: false,
      pathspecs: PATHSPECS,
    });

    if (matches.length === 0) return { ok: true };

    const listed = matches
      .map((m) => `${m.path}:${m.line}  ${m.text.trim()}`)
      .join("\n    ");
    return {
      ok: false,
      message: `${matches.length} direct chromium launch(es) in e2e scripts:\n    ${listed}`,
      hint:
        "Use `withBrowser(async (h) => { const { page } = await h.session(); … })` from " +
        "@plugins/framework/plugins/tooling/plugins/e2e-harness/e2e. A direct launch skips the " +
        "agent-origin headers (so the run's pages and config writes are unattributable and " +
        "unrevertible), skips the config revert that puts the user's settings back, and skips " +
        "browser.close().",
    };
  },
};

export default check;
