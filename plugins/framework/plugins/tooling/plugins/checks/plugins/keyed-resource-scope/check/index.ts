import { grepCode } from "@plugins/framework/plugins/tooling/plugins/checks/core";
import {
  maskSource,
  parseStringField,
  markerCallSpans,
  lineAt,
} from "@plugins/plugin-meta/plugins/parse-utils/core";

type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = { id: string; description: string; run(): Promise<CheckResult> };

async function getRoot(): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return (await new Response(proc.stdout).text()).trim();
}

const check: Check = {
  id: "keyed-resource-scope",
  description:
    "Every `mode: \"keyed\"` `defineResource(...)` must declare a scope policy — either `identityTable` (scope a change to its own keys) or the explicit `recompute:` FULL opt-out — so a keyed resource can never SILENTLY fall back to FULL recompute. This is a static BACKSTOP to the primary type constraint (which makes the omission a tsc error): it catches type bypasses (`as any`, `// @ts-ignore`, local wrappers) and guards against the type being weakened later. KNOWN LIMITATION: it scans the DECLARATION in the call body, not actual DB reads, so a keyed loader delegating its DB work to an imported helper is out of scope by design — the type is the primary enforcement. See research/2026-06-20-global-scoped-recompute-default.md.",
  async run() {
    const root = await getRoot();

    // Fast pre-filter: candidate files that mention the identifier at all. The
    // per-line `pattern` here intentionally matches only the bare identifier
    // (`\bdefineResource\b`) — NOT a full `<…>(`-tolerant call token — because a
    // generic call can SPAN LINES (`defineResource<\n  T\n>(…)`), and the precise
    // span walk below (`markerCallSpans`) is whole-file (multiline). A
    // `(`-anchored per-line pre-filter would miss those calls and wrongly drop
    // the file from candidates. `\bdefineResource\b` does NOT match
    // `defineExternalResource` (no `defineResource` substring in it), so external
    // resources never enter the set.
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
      for (const span of markerCallSpans(masked, "defineResource")) {
        const block = masked.slice(span.open, span.close + 1);
        if (parseStringField(block, "mode") !== "keyed") continue;
        if (hasIdentityTable.test(block) || hasRecompute.test(block)) continue;
        offenders.push(`${rel}:${lineAt(masked, span.identifier)}`);
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
