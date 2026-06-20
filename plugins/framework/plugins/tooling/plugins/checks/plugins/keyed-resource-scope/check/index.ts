import { grepCode } from "@plugins/framework/plugins/tooling/plugins/checks/core";
import { maskSource, parseStringField } from "@plugins/plugin-meta/plugins/parse-utils/core";

type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = { id: string; description: string; run(): Promise<CheckResult> };

async function getRoot(): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return (await new Response(proc.stdout).text()).trim();
}

// The `defineResource` IDENTIFIER, then optionally a generic argument list
// (`<Task | null, { id: string }>`), then the call `(`. `defineExternalResource`
// is NOT matched: the leading `\b` plus the literal `defineResource` token means
// `…External…` never aligns (it's `define`+`External`+`Resource`). The match
// tolerates a `.`-member prefix (`h.runtime.defineResource(…)`) because `\b`
// after a `.` still anchors the identifier. The `<[^()]*?>` is a deliberately
// shallow generic skip — it stops at the first `(`/`)`, which is correct because
// a type argument never contains a paren, while a `<` in a real comparison
// expression is never immediately preceded by the `defineResource` token.
const CALL_TOKEN = /\bdefineResource\s*(?:<[^()]*?>)?\s*\(/g;

/**
 * For each `defineResource[<…>](` occurrence in `masked`, return the byte span of
 * its argument-object — from the call's `(` to its matching `)` — by walking a
 * paren-depth counter over the masked source (strings/comments already blanked,
 * so braces/parens inside them can't throw off the count). Block-level scoping
 * means a file that mixes a keyed resource with *other* `defineResource` calls is
 * evaluated per-call, never file-wide.
 */
function defineResourceSpans(masked: string): Array<{ start: number; end: number }> {
  const spans: Array<{ start: number; end: number }> = [];
  const re = new RegExp(CALL_TOKEN.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(masked)) !== null) {
    // The match ends ON the call's opening paren; position the cursor there.
    let i = m.index + m[0].length - 1;
    let depth = 0;
    const start = i;
    for (; i < masked.length; i++) {
      const ch = masked[i];
      if (ch === "(") depth++;
      else if (ch === ")") {
        depth--;
        if (depth === 0) break;
      }
    }
    spans.push({ start, end: i });
    // Resume after this call's closing paren so nested matches aren't double-read.
    re.lastIndex = i + 1;
  }
  return spans;
}

/** 1-based line number of byte offset `idx` in `src`. */
function lineAt(src: string, idx: number): number {
  let line = 1;
  for (let i = 0; i < idx && i < src.length; i++) {
    if (src[i] === "\n") line++;
  }
  return line;
}

const check: Check = {
  id: "keyed-resource-scope",
  description:
    "Every `mode: \"keyed\"` `defineResource(...)` must declare a scope policy — either `identityTable` (scope a change to its own keys) or the explicit `recompute:` FULL opt-out — so a keyed resource can never SILENTLY fall back to FULL recompute. This is a static BACKSTOP to the primary type constraint (which makes the omission a tsc error): it catches type bypasses (`as any`, `// @ts-ignore`, local wrappers) and guards against the type being weakened later. KNOWN LIMITATION: it scans the DECLARATION in the call body, not actual DB reads, so a keyed loader delegating its DB work to an imported helper is out of scope by design — the type is the primary enforcement. See research/2026-06-20-global-scoped-recompute-default.md.",
  async run() {
    const root = await getRoot();

    // Fast pre-filter: candidate files that mention the identifier at all. The
    // per-line `pattern` here intentionally matches only the bare identifier
    // (`\bdefineResource\b`) — NOT the full `<…>(`-tolerant CALL_TOKEN — because
    // a generic call can SPAN LINES (`defineResource<\n  T\n>(…)`), and the
    // precise span walk below is whole-file (multiline). Using CALL_TOKEN here
    // would per-line-miss those calls and wrongly drop the file from candidates.
    // `\bdefineResource\b` does NOT match `defineExternalResource` (the trailing
    // `\b` fails before `External`), so external resources never enter the set.
    const matches = await grepCode({
      root,
      pattern: /\bdefineResource\b/,
      grepArg: "defineResource",
      fixed: true,
      maskStrings: true,
    });
    // Skip test fixtures: `*.test.ts(x)` / `__tests__/` files construct
    // edge-case resource shapes (e.g. keyed WITHOUT identityTable) precisely to
    // exercise the runtime's defensive FULL-fallback path — they are not app
    // resource declarations. This mirrors the type-check exclusion (the same
    // patterns are excluded from server-core/tsconfig.json), so the enforced
    // surface stays identical between the type constraint and this backstop.
    const isTestPath = (rel: string) => /\.test\.tsx?$/.test(rel) || rel.includes("__tests__/");
    const candidatePaths = [...new Set(matches.map((m) => m.path))].filter((rel) => !isTestPath(rel));

    // A keyed span PASSES iff it declares `identityTable:` (scoped to its own
    // keys) OR `recompute:` (an explicit FULL opt-out).
    const hasIdentityTable = /\bidentityTable\s*:/;
    const hasRecompute = /\brecompute\s*:/;

    const offenders: string[] = [];
    for (const rel of candidatePaths) {
      const src = await Bun.file(`${root}/${rel}`)
        .text()
        .catch(() => null);
      if (src == null) continue;
      // Mask comments + regex literals but KEEP string interiors (`strings:
      // false`): we must read the STRING VALUE of `mode` (`"keyed"`), which a
      // full string-mask would blank to `""`. Comments are still blanked, so a
      // commented-out `identityTable:` (e.g. `// No identityTable:` in the
      // runtime tests) never counts as a real declaration. The
      // `identityTable:`/`recompute:` field tokens are implausible as a string
      // interior inside this call, so keeping strings is safe for them.
      const masked = maskSource(src, { strings: false });
      for (const span of defineResourceSpans(masked)) {
        const block = masked.slice(span.start, span.end + 1);
        if (parseStringField(block, "mode") !== "keyed") continue;
        if (hasIdentityTable.test(block) || hasRecompute.test(block)) continue;
        offenders.push(`${rel}:${lineAt(masked, span.start)}`);
      }
    }

    if (offenders.length === 0) return { ok: true };

    return {
      ok: false,
      message: `Keyed \`defineResource(\` without a scope policy in ${offenders.length} place(s) (declares neither \`identityTable\` nor \`recompute\`):\n    ${offenders.join("\n    ")}`,
      hint:
        "A `mode: \"keyed\"` resource that declares neither field SILENTLY FULL-recomputes the whole cascade on its own table — the exact regression scoped recompute was built to remove. Declare `identityTable` set to the base table whose PK equals `keyOf`'s id, so a single-row change scopes to your own keys; or, if the key is irreducibly whole-set, opt into FULL deliberately with `recompute: { kind: \"full\", reason: \"…\" }`. See research/2026-06-20-global-scoped-recompute-default.md.",
    };
  },
};

export default check;
