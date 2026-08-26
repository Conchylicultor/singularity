import { grepCode } from "@plugins/framework/plugins/tooling/plugins/checks/core";
import {
  maskSource,
  matchBracket,
  parseStringField,
  markerCallSpans,
  lineAt,
} from "@plugins/plugin-meta/plugins/parse-utils/core";
import { getWorktreeRoot } from "@plugins/infra/plugins/spawn/core";

type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = { id: string; description: string; run(): Promise<CheckResult> };

// The four ways a keyed `identityTable` resource can answer "which subscribed
// tuple owns a changed row?" — the second half of `ScopePolicy`. Exactly one is
// required; see the arm docs on `ScopePolicy` in
// `plugins/framework/plugins/resource-runtime/core/runtime.ts`.
const SCOPE_ARMS = [
  "rowIdentity",
  "membership",
  "scopedMembership",
  "fanOut",
] as const;

const check: Check = {
  id: "keyed-resource-scope",
  description:
    'A keyed live-state resource MUST be declared via a CLIENT-SHARED `keyedResourceDescriptor(...)` plus the two-arg `defineResource(descriptor, opts)` form, so `keyOf` is declared once and the server can never drift from the client. This static BACKSTOP forbids the two ways keyed-ness can be smuggled into the server without a shared descriptor: (1) the flat `mode: "keyed"` form (banned at the type level via `ServerResourceOptions` rejecting `mode:"keyed"`, so any textual `mode:"keyed"` is a type bypass — `as any`, `// @ts-expect-error`, a local wrapper), and (2) an inline `keyed:` contract literal as the FIRST argument (the sanctioned form passes an imported descriptor IDENTIFIER, so `keyed:` never appears in a real call). Both let server keyed-ness drift from the client and crash the browser ("no keyOf registered for keyed resource") with no compile-time signal. See research/2026-06-21-global-keyed-resource-flat-form-elimination.md.\n\nIt also enforces (3) the second half of `ScopePolicy`: an opts object declaring `identityTable` MUST declare exactly one of `rowIdentity` / `membership` / `scopedMembership` / `fanOut: { reason }`. `identityTable` says which RESOURCE a change belongs to; it never said which subscribed TUPLE of it, so the feed router woke every subscribed tuple — each of which re-ran its own read, found the changed row was not its own, and diffed to empty. No frame shipped, which is exactly what hid the cost: the read IS the cost. `tsc` enforces this at every hand-written call site (the four-arm `ScopePolicy` union); this check is the BACKSTOP for the opts objects built behind an `as … & ScopePolicy` cast, which `tsc` cannot see through. `fanOut` is the honest answer where fan-out is genuinely required (a composite pk the change feed emits no ids for; params keying a foreign column; a param-less single tuple) and normalizes to nothing at runtime — but its `reason` must be a real sentence about THAT resource. See research/2026-08-25-global-own-row-resource-scoping.md.',
  async run() {
    const root = await getWorktreeRoot();

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
    const isTestPath = (rel: string) =>
      /\.test\.tsx?$/.test(rel) || rel.includes("__tests__/");
    const candidatePaths = [...new Set(matches.map((m) => m.path))].filter(
      (rel) => !isTestPath(rel),
    );

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
          if (
            !/[A-Za-z0-9_$]/.test(prev) &&
            /^keyed\s*:/.test(firstArg.slice(i))
          )
            return true;
        }
      }
      return false;
    };

    // Rule 3 works on the SECOND argument's object-literal body. `maskedBlock`
    // aligns 1:1 with `block`, so the structural scan runs over the mask (a comma
    // or brace inside a string / comment / regex cannot split the arguments) while
    // the body is sliced from the original for `parseStringField` to read.
    // `null` = nothing to check here: a one-argument call (the flat push/invalidate
    // form, which `ScopePolicy` does not govern), or a second argument that is not
    // a literal — `defineResource(descriptor, serverOpts)`, the shape the two
    // query-resource compilers use, whose policy object is checked by `tsc` at its
    // own `const scopePolicy: ScopePolicy<P>` annotation instead.
    const secondArgObjectBody = (
      block: string,
      maskedBlock: string,
    ): string | null => {
      let depth = 0;
      let comma = -1;
      for (let i = 1; i < maskedBlock.length - 1; i++) {
        const c = maskedBlock[i];
        if (c === "{" || c === "[" || c === "(") depth++;
        else if (c === "}" || c === "]" || c === ")") depth--;
        else if (c === "," && depth === 0) {
          comma = i;
          break;
        }
      }
      if (comma < 0) return null;
      let i = comma + 1;
      while (i < maskedBlock.length && /\s/.test(maskedBlock[i]!)) i++;
      if (maskedBlock[i] !== "{") return null;
      const close = matchBracket(maskedBlock, i, "{", "}");
      if (close < 0) return null;
      // Strictly between the braces: `parseStringField(…, { depth0: true })`
      // expects an object BODY (it skips nested `{}`/`[]`/`()` blocks, so a
      // leading `{` would swallow every key).
      return block.slice(i + 1, close);
    };

    // A field is DECLARED when the key is present in real code at the body's top
    // level, whatever its value is: `parseStringField` answers `absent` only when
    // the key is genuinely not there, and `dynamic` for the closures / object
    // literals these four arms actually hold.
    const declares = (body: string, field: string): boolean =>
      parseStringField(body, field, { depth0: true }).kind !== "absent";

    const descriptorOffenders: string[] = [];
    const scopeArmOffenders: string[] = [];
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
          descriptorOffenders.push(`${rel}:${line} (flat mode:"keyed")`);
          continue;
        }
        if (modeField.kind === "dynamic") {
          descriptorOffenders.push(
            `${rel}:${line} (non-literal mode: \`${modeField.expr}\` — cannot be proven not "keyed")`,
          );
          continue;
        }

        // Rule 3 — the tuple-ownership arm. Only a KEYED resource is governed by
        // `ScopePolicy`, and keyed-ness comes solely from the descriptor: a keyed
        // contract derives its mode from its own `keyOf` and so never writes
        // `mode:` at all. A call that DOES state a literal `mode:` is therefore a
        // `push`/`invalidate` resource (mail's label mirror, the events/threads
        // revision ticks) whose `identityTable` only routes recompute scoping —
        // there is no per-tuple fan-out to answer for. Read at the OPTS object's
        // own top level (rule 1's whole-call read is the right scope for a
        // smuggling check, the wrong one for deciding "is this keyed?").
        const optsBody = secondArgObjectBody(
          block,
          masked.slice(span.open, span.close + 1),
        );
        if (
          optsBody !== null &&
          parseStringField(optsBody, "mode", { depth0: true }).kind ===
            "absent" &&
          declares(optsBody, "identityTable")
        ) {
          const armed = SCOPE_ARMS.filter((arm) => declares(optsBody, arm));
          if (armed.length !== 1) {
            scopeArmOffenders.push(
              armed.length === 0
                ? `${rel}:${line} (identityTable with no ownership arm)`
                : `${rel}:${line} (identityTable with ${armed.length} ownership arms: ${armed.join(", ")})`,
            );
          }
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
          descriptorOffenders.push(`${rel}:${line} (inline keyed: contract)`);
        }
      }
    }

    if (descriptorOffenders.length === 0 && scopeArmOffenders.length === 0)
      return { ok: true };

    const messages: string[] = [];
    const hints: string[] = [];
    if (descriptorOffenders.length > 0) {
      messages.push(
        `Keyed \`defineResource(\` not declared through a shared descriptor in ${descriptorOffenders.length} place(s):\n    ${descriptorOffenders.join("\n    ")}`,
      );
      hints.push(
        'A keyed live-state resource MUST be declared via a CLIENT-SHARED `keyedResourceDescriptor(key, schema, initialData, keyOf)` plus the two-arg `defineResource(descriptor, { loader, identityTable, … })` form — never the flat `mode: "keyed"` form and never an inline `keyed:` contract literal. Both smuggle keyed-ness into the server without sharing `keyOf` with the client, so the server\'s keyed-ness can drift from the client and crash the browser ("no keyOf registered for keyed resource") with no compile-time signal. Move the contract (`key`/`schema`/`keyOf`) into a shared descriptor the server can import, then pass only the DB half as `opts`. See research/2026-06-21-global-keyed-resource-flat-form-elimination.md.',
      );
    }
    if (scopeArmOffenders.length > 0) {
      messages.push(
        `\`identityTable\` without exactly one tuple-ownership arm in ${scopeArmOffenders.length} place(s):\n    ${scopeArmOffenders.join("\n    ")}`,
      );
      hints.push(
        'An opts object declaring `identityTable` must declare exactly one of `rowIdentity: (params) => rowId` (the tuple names ONE row of the table — routing only, the owner\'s frames are unchanged), `membership` / `scopedMembership` (the tuple names a bounded window or point set), or `fanOut: { reason }` (every subscribed tuple genuinely must be woken — write the real reason for THIS resource: a composite pk the change feed emits no ids for, params keying a foreign column, a param-less single tuple). Without an arm the feed wakes every subscribed tuple, each of which re-reads its own row, finds the changed row is not its own, and diffs to empty — no frame ships, so the cost is invisible; the read IS the cost. `fanOut` changes nothing at runtime, exactly like `recompute: { kind: "full", reason }`. See research/2026-08-25-global-own-row-resource-scoping.md and the `ScopePolicy` doc in plugins/framework/plugins/resource-runtime/core/runtime.ts.',
      );
    }

    return {
      ok: false,
      message: messages.join("\n\n  "),
      hint: hints.join("\n\n  "),
    };
  },
};

export default check;
