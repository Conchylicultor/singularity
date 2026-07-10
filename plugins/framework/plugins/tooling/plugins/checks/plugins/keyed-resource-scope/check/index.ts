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
    "A keyed live-state resource MUST be declared via a CLIENT-SHARED `keyedResourceDescriptor(...)` plus the two-arg `defineResource(descriptor, opts)` form, so `keyOf` is declared once and the server can never drift from the client. This static BACKSTOP forbids the two ways keyed-ness can be smuggled into the server without a shared descriptor: (1) the flat `mode: \"keyed\"` form (banned at the type level via `ServerResourceOptions` rejecting `mode:\"keyed\"`, so any textual `mode:\"keyed\"` is a type bypass — `as any`, `// @ts-expect-error`, a local wrapper), and (2) an inline `keyed:` contract literal as the FIRST argument (the sanctioned form passes an imported descriptor IDENTIFIER, so `keyed:` never appears in a real call). Both let server keyed-ness drift from the client and crash the browser (\"no keyOf registered for keyed resource\") with no compile-time signal. See research/2026-06-21-global-keyed-resource-flat-form-elimination.md.",
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
    // deliberate edge-case resource shapes (including the now-banned flat keyed
    // form) precisely to exercise the runtime's defensive paths — they are not
    // app resource declarations.
    const isTestPath = (rel: string) => /\.test\.tsx?$/.test(rel) || rel.includes("__tests__/");
    const candidatePaths = [...new Set(matches.map((m) => m.path))].filter((rel) => !isTestPath(rel));

    // Rule 2 (inline `keyed:` contract) must only fire on a top-level field of
    // the FIRST argument's object literal. We walk the first-arg substring at
    // brace depth 1, skipping comments/strings, so a nested `keyed` property in a
    // loader's data object — or any `keyed:` in the second `opts` arg — never
    // false-positives.
    const inlineKeyedAtDepth1 = (firstArg: string): boolean => {
      let depth = 0;
      for (let i = 0; i < firstArg.length; i++) {
        const c = firstArg[i];
        // `firstArg` is sliced from the ORIGINAL call text (so `mode`'s string
        // value stays readable), meaning string interiors are present — skip
        // them here lest a `keyed:`-looking substring inside a string mislead the
        // depth scan. The enclosing call was located over a FULL mask, so a
        // string-embedded `defineResource(...)` never reaches this walk.
        if (c === '"' || c === "'" || c === "`") {
          const q = c;
          i++;
          while (i < firstArg.length && firstArg[i] !== q) {
            if (firstArg[i] === "\\") i++;
            i++;
          }
          continue;
        }
        if (c === "{") depth++;
        else if (c === "}") depth--;
        else if (depth === 1 && c === "k") {
          // Match `keyed:` only when `k` is a token start (the previous char is
          // not an identifier char), so a longer property name ending in `keyed`
          // never matches.
          const prev = firstArg[i - 1] ?? "";
          if (!/[A-Za-z0-9_$]/.test(prev) && /^keyed\s*:/.test(firstArg.slice(i))) return true;
        }
      }
      return false;
    };

    const offenders: string[] = [];
    for (const rel of candidatePaths) {
      const src = await Bun.file(`${root}/${rel}`)
        .text()
        .catch(() => null);
      if (src == null) continue;
      // FULL mask (comments + regex + string interiors blanked): a
      // `defineResource(...)` written inside a string or template literal
      // vanishes from the mask, so `markerCallSpans` can never surface a
      // string-embedded call as real. Each genuine call is located over the
      // mask; its `block` is sliced from the ORIGINAL at the matched offsets
      // (they align 1:1), so `parseStringField(block, "mode")` reads the real
      // `"keyed"` value that a full string-mask would have blanked to `""`.
      const masked = maskSource(src);
      for (const span of markerCallSpans(masked, "defineResource")) {
        const block = src.slice(span.open, span.close + 1);
        const line = lineAt(masked, span.identifier);

        // Rule 1 — flat keyed bypass. The sanctioned two-arg keyed form passes an
        // imported descriptor and NEVER writes `mode:` textually, so any `mode:`
        // in the call is a flat-form bypass. A literal `mode: "keyed"` is the
        // direct offender; a NON-LITERAL `mode: SOME_VAR` cannot be proven not to
        // resolve to "keyed" at runtime, so it is the exact smuggling vector this
        // check's threat model anticipates and is flagged too.
        const modeField = parseStringField(block, "mode");
        if (modeField.kind === "value" && modeField.value === "keyed") {
          offenders.push(`${rel}:${line} (flat mode:"keyed")`);
          continue;
        }
        if (modeField.kind === "dynamic") {
          offenders.push(
            `${rel}:${line} (non-literal mode: \`${modeField.expr}\` — cannot be proven not "keyed")`,
          );
          continue;
        }

        // Rule 2 — inline `keyed:` contract literal. Only when the FIRST
        // argument is an object literal. The sanctioned form passes a descriptor
        // IDENTIFIER, so an inline `{ key, schema, keyed: { keyOf } }` first arg
        // is the only way `keyed:` shows up at the call's contract position.
        // `block` is `(...args...)`; find the first non-space char after `(`.
        let i = 1;
        while (i < block.length && /\s/.test(block[i]!)) i++;
        if (block[i] !== "{") continue; // first arg is an identifier → rule 2 N/A
        // Slice the first-arg object literal: from this `{` to its matching `}`.
        let depth = 0;
        let firstArgEnd = -1;
        for (let j = i; j < block.length; j++) {
          const c = block[j];
          if (c === '"' || c === "'" || c === "`") {
            const q = c;
            j++;
            while (j < block.length && block[j] !== q) {
              if (block[j] === "\\") j++;
              j++;
            }
            continue;
          }
          if (c === "{") depth++;
          else if (c === "}") {
            depth--;
            if (depth === 0) {
              firstArgEnd = j;
              break;
            }
          }
        }
        if (firstArgEnd < 0) continue;
        const firstArg = block.slice(i, firstArgEnd + 1);
        if (inlineKeyedAtDepth1(firstArg)) {
          offenders.push(`${rel}:${line} (inline keyed: contract)`);
        }
      }
    }

    if (offenders.length === 0) return { ok: true };

    return {
      ok: false,
      message: `Keyed \`defineResource(\` not declared through a shared descriptor in ${offenders.length} place(s):\n    ${offenders.join("\n    ")}`,
      hint:
        "A keyed live-state resource MUST be declared via a CLIENT-SHARED `keyedResourceDescriptor(key, schema, initialData, keyOf)` plus the two-arg `defineResource(descriptor, { loader, identityTable, … })` form — never the flat `mode: \"keyed\"` form and never an inline `keyed:` contract literal. Both smuggle keyed-ness into the server without sharing `keyOf` with the client, so the server's keyed-ness can drift from the client and crash the browser (\"no keyOf registered for keyed resource\") with no compile-time signal. Move the contract (`key`/`schema`/`keyOf`) into a shared descriptor the server can import, then pass only the DB half as `opts`. See research/2026-06-21-global-keyed-resource-flat-form-elimination.md.",
    };
  },
};

export default check;
