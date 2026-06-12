import { ESLintUtils, type TSESLint, type TSESTree } from "@typescript-eslint/utils";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/anthropics/singularity/lint/${name}`,
);

/**
 * Corner-radius guardrail.
 *
 * Corner radius must come from the token-driven `rounded-*` scale (`rounded-sm`,
 * `rounded-md`, `rounded-lg`, …), whose values resolve to the `--radius` shape
 * token so a Shape preset (Sharp / Rounded / Pill) re-softens every corner
 * together. Two shapes bypass that token and freeze a corner at a literal value:
 *
 *   A. bare `rounded` — Tailwind's static `0.25rem`, which does NOT read
 *      `--radius`, so no shape preset can move it (this is exactly the bug the
 *      `Row` primitive's bare `rounded` had: list rows stayed at 0.25rem under
 *      every preset).
 *   B. an arbitrary value `rounded-[…]` (e.g. `rounded-[2px]`) — a hand-pinned
 *      literal radius that likewise ignores the shape token.
 *
 * `rounded-none` and `rounded-full` are NOT flagged: they are intentional,
 * preset-independent shapes (a hard corner, a pill/circle). The named scale
 * steps (`rounded-sm/md/lg/xl/2xl/3xl`) are token-driven and allowed.
 *
 * This rule fires on ANY element (not just a host-tag subset): radius is set
 * everywhere, so the redirect to the token scale applies everywhere.
 *
 * No auto-fix: choosing the right scale step (or an intentional
 * `rounded-full`/`rounded-none`) is a design decision, unsafe to mechanize.
 *
 * Class strings appear in two shapes — bare JSX `className="…"` and inside
 * `cn(...)`/`clsx(...)`/template literals. We only inspect strings in a
 * class-name context (a `className`/`class` attribute value, or a class-builder
 * argument), via the same `collectTokens` walk the sibling `no-adhoc-*` rules
 * use, so a doc-string or fixture that merely mentions `rounded` is never
 * flagged. The shared walk also resolves same-file object/array MAP aliases
 * indexed in a class context (e.g. a bare `rounded` in a style map reached via
 * `cn(MAP[key])`) — but NOT a bare string `const` (see the shared block below).
 */

// Bare `rounded` only — the static 0.25rem that bypasses --radius. Anchored with
// `$` so the named scale (`rounded-sm`, `rounded-md`, …), `rounded-none`, and
// `rounded-full` are intentionally OUT.
const BARE = /^rounded$/;
// Arbitrary value: `rounded-[…]` pins a literal radius that ignores --radius.
const ARBITRARY = /^rounded-\[/;

/** JSX attribute names whose value is a class-name string. */
const CLASS_ATTRS = new Set(["className", "class"]);
/** Class-builder calls whose string arguments are class-name strings. */
const CLASS_BUILDERS = new Set(["cn", "clsx", "twMerge"]);

// >>> shared:class-token-walk — keep byte-identical across the no-adhoc-* class rules (enforced by the class-token-walk-in-sync check) >>>
/**
 * Recursively harvest class-name tokens from a class-value subtree into `out`.
 *
 * Directly contained strings are harvested wherever they sit: bare `Literal`
 * `.value`s and `TemplateElement.value.raw`s (split on whitespace), inside
 * `cn(...)`/`clsx(...)` calls, ternaries, `clsx({ "text-x": cond })` object
 * keys, and arbitrary nesting — the walk is structural, not shape-specific.
 *
 * It ALSO follows same-file aliases, but ONLY when an `Identifier` reached from
 * a class context resolves to an object/array-literal MAP indexed directly in
 * that context (e.g. `cn(TONE[tone])`, `styles.title`). The map's initializer is
 * then harvested too — this is what catches a banned class parked in a style/tone
 * map. A standalone string/template `const` (shared mono/code metrics are out of
 * scope) and a styling-function result (`cva(...)`) are deliberately NOT followed,
 * and a map reached only through an intermediate local is out of range by design.
 * Resolution is same-file only (an imported or parameter binding has no in-file
 * initializer to read) and cycle-guarded via `seen`. Because the walk only ever
 * starts from a real class-name context, an unrelated doc-string that merely
 * mentions `text-sm` is never inspected.
 */
function collectTokens(
  sourceCode: TSESLint.SourceCode,
  node: TSESTree.Node | null | undefined,
  out: Set<string>,
  seen: Set<unknown> = new Set(),
): void {
  if (!node) return;
  if (node.type === "Literal") {
    if (typeof node.value === "string") {
      for (const t of node.value.split(/\s+/)) if (t) out.add(t);
    }
    return;
  }
  if (node.type === "TemplateElement") {
    for (const t of node.value.raw.split(/\s+/)) if (t) out.add(t);
    return;
  }
  if (node.type === "Identifier") {
    let scope: TSESLint.Scope.Scope | null = sourceCode.getScope(node);
    let variable: TSESLint.Scope.Variable | undefined;
    while (scope && !variable) {
      variable = scope.variables.find((v) => v.name === node.name);
      scope = scope.upper;
    }
    if (variable && !seen.has(variable)) {
      seen.add(variable);
      for (const def of variable.defs) {
        // Maps-only: follow a same-file alias ONLY into an object/array-literal
        // map — the documented "style map drives classes" pattern, indexed
        // directly in a class context (e.g. `cn(TONE[tone])`). A standalone
        // string/template const (shared mono-code metrics — code/mono is out of
        // scope) or a styling-function result (`cva(...)`) is deliberately NOT
        // followed, and a map reached only through an intermediate local is out
        // of range by design.
        const init = def.type === "Variable" ? def.node.init : null;
        if (init && (init.type === "ObjectExpression" || init.type === "ArrayExpression")) {
          collectTokens(sourceCode, init, out, seen);
        }
      }
    }
    return;
  }
  for (const key of Object.keys(node)) {
    if (key === "parent") continue;
    const value = (node as unknown as Record<string, unknown>)[key];
    if (Array.isArray(value)) {
      for (const child of value) {
        if (child && typeof child === "object" && "type" in child) {
          collectTokens(sourceCode, child as TSESTree.Node, out, seen);
        }
      }
    } else if (value && typeof value === "object" && "type" in value) {
      collectTokens(sourceCode, value as TSESTree.Node, out, seen);
    }
  }
}
// <<< shared:class-token-walk <<<

/**
 * Strip Tailwind variant prefixes (`hover:`, `focus:`, `md:`, `dark:`, …) so the
 * utility underneath is tested on its own. Variants are colon-delimited and the
 * utility itself is the LAST `:`-segment (e.g. `md:rounded` -> `rounded`). This
 * mirrors how the sibling `no-adhoc-*` rules reason about prefixed tokens.
 */
function baseClass(token: string): string {
  const idx = token.lastIndexOf(":");
  return idx === -1 ? token : token.slice(idx + 1);
}

export default createRule({
  name: "no-adhoc-radius",
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow bare `rounded` (static 0.25rem) and arbitrary `rounded-[…]` — set corner radius through the token-driven rounded-* scale.",
    },
    schema: [],
    messages: {
      adhocRadius:
        "Raw radius class `{{token}}` is banned — bare `rounded` is a static " +
        "0.25rem and `rounded-[…]` is a pinned literal, both bypassing the " +
        "`--radius` shape token. Use a token-driven scale step (`rounded-sm` / " +
        "`rounded-md` / `rounded-lg` / …) so Shape presets can re-soften it, or " +
        "`rounded-full` / `rounded-none` for an intentional fixed shape.",
    },
  },
  defaultOptions: [],
  create(context) {
    /** Report every banned class token in the harvested set. */
    function checkTokens(node: TSESTree.Node, tokens: Set<string>) {
      for (const token of tokens) {
        const c = baseClass(token);
        if (BARE.test(c) || ARBITRARY.test(c)) {
          context.report({ node, messageId: "adhocRadius", data: { token: c } });
        }
      }
    }

    return {
      // className / class attribute values — `className="…"`,
      // `className={`…`}`, `className={cn(…)}`, etc., on ANY element.
      JSXAttribute(node) {
        if (node.name.type !== "JSXIdentifier" || !CLASS_ATTRS.has(node.name.name)) return;
        const tokens = new Set<string>();
        collectTokens(context.sourceCode, node.value, tokens);
        checkTokens(node, tokens);
      },
      // Class-builder calls — `cn(...)`, `clsx(...)`, … — wherever they appear
      // (a `const cls = cn("rounded")` assigned outside JSX still counts).
      CallExpression(node) {
        if (node.callee.type !== "Identifier" || !CLASS_BUILDERS.has(node.callee.name)) {
          return;
        }
        const tokens = new Set<string>();
        for (const arg of node.arguments) collectTokens(context.sourceCode, arg, tokens);
        checkTokens(node, tokens);
      },
    };
  },
});
