import { grepCode } from "@plugins/framework/plugins/tooling/plugins/checks/core";
import { getWorktreeRoot } from "@plugins/infra/plugins/spawn/core";

type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = { id: string; description: string; inputKeyed?: boolean; run(): Promise<CheckResult> };

// A CHECK, not a lint rule, on purpose: a contributed lint rule runs repo-wide
// (the root eslint config enables every `plugins/*/lint/` rule as an error over
// `**/*.{ts,tsx}`), and there are many legitimate hand-written `<code>` elements
// elsewhere in the repo. The invariant is path-scoped — inside active-data, an
// inline code span must be the one shared `<InlineCode>` — so it needs a check,
// which can be scoped.
// This file names the banned token in its own pattern, comments and hint — all
// three are masked by `grepCode` (comments, strings AND regex literals), so it is
// self-exempt by construction and needs no allowlist entry.
const SCOPE = "plugins/active-data/";

const check: Check = {
  id: "active-data:no-adhoc-inline-code",
  // INPUT-KEYED (Stage 1). Pure `grepCode` — see no-raw-event-source for rationale.
  inputKeyed: true,
  description:
    "active-data renders inline code through the shared <InlineCode> primitive, never a hand-rolled <code> element",
  async run() {
    const root = await getWorktreeRoot();
    const matches = await grepCode({
      root,
      pattern: /<code[\s/>]/,
      grepArg: "<code",
      fixed: true,
      maskStrings: true,
    });

    const offenders = matches
      .filter((m) => m.path.startsWith(SCOPE))
      .map((m) => `${m.path}:${m.line}:${m.text}`);

    if (offenders.length === 0) return { ok: true };

    return {
      ok: false,
      message: `hand-rolled \`<code>\` inside active-data in ${offenders.length} place(s):\n    ${offenders.join("\n    ")}`,
      hint:
        "Use `<InlineCode>` from `@plugins/primitives/plugins/markdown/web`. A local `<code>` re-states the markdown base styling (so it drifts), and — inside a `display:\"code\"` contribution — it is how a contribution used to publish 'I can't resolve this' as a rendering indistinguishable from success. Declining is `declined(reason)` from `@plugins/active-data/web`; the host owns the fallback.",
    };
  },
};

export default check;
