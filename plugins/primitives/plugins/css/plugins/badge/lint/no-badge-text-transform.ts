import { ESLintUtils, type TSESTree } from "@typescript-eslint/utils";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/anthropics/singularity/lint/${name}`,
);

/**
 * CSS `text-transform` on a `<Badge>` (`capitalize`, `uppercase`, `lowercase`)
 * decides label casing in the stylesheet instead of in the content. That is the
 * exact mechanism behind the badge-casing inconsistency: `capitalize` on a raw
 * Claude model flag (a `claude-<family>-<ver>` string) mangles it instead of
 * showing the registry label, and an
 * `uppercase` "eyebrow" treatment copy-pasted across call sites fragments the
 * one house rule (sentence case for derived labels, verbatim for proper nouns).
 *
 * Casing must live in the CONTENT, never in CSS:
 *   - enum-derived labels → `formatStatusLabel(key)` (@plugins/primitives/plugins/css/plugins/badge/web)
 *   - model names → the model registry label ("Opus 4.8")
 *   - an intentional all-caps alarm → author the literal string ("BYPASS ACTIVE")
 *
 * The rule fires only on the `<Badge>` JSX element (capitalized tag); the
 * primitive's own internal markup renders a lowercase host tag, so this never
 * polices Badge's implementation. Mirrors `no-adhoc-chip`'s className-walking
 * (`collectTokens`) so it sees tokens inside `cn()`, template literals, and
 * ternaries. No auto-fix — the correct replacement (formatter vs registry vs
 * literal) is a per-site judgement.
 */

// text-transform utilities, including responsive/variant-prefixed forms
// (`sm:uppercase`, `hover:capitalize`). Match the final segment after any `:`.
const TEXT_TRANSFORM = new Set(["capitalize", "uppercase", "lowercase"]);

function isTextTransform(token: string): boolean {
  const base = token.includes(":") ? token.slice(token.lastIndexOf(":") + 1) : token;
  return TEXT_TRANSFORM.has(base);
}

/**
 * Recursively collect class-name string tokens from a `className` attribute
 * value subtree. Harvests only string `Literal` `.value`s and
 * `TemplateElement.value.raw`s — never identifiers from dynamic expressions, so
 * a `STYLES[x]` member access stays opaque. Structural recursion (visit every
 * child) covers `JSXExpressionContainer`, `TemplateLiteral`, `cn()`/`clsx()`
 * calls, ternaries, and arbitrary nesting without enumerating each shape.
 */
function collectTokens(node: TSESTree.Node | null | undefined, out: Set<string>): void {
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
  for (const key of Object.keys(node)) {
    if (key === "parent") continue;
    const value = (node as unknown as Record<string, unknown>)[key];
    if (Array.isArray(value)) {
      for (const child of value) {
        if (child && typeof child === "object" && "type" in child) {
          collectTokens(child as TSESTree.Node, out);
        }
      }
    } else if (value && typeof value === "object" && "type" in value) {
      collectTokens(value as TSESTree.Node, out);
    }
  }
}

export default createRule({
  name: "no-badge-text-transform",
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow CSS text-transform (capitalize/uppercase/lowercase) on <Badge> — casing must live in the content, not the stylesheet.",
    },
    schema: [],
    messages: {
      textTransform:
        "CSS text-transform on a <Badge> is banned — casing must live in the content, not CSS. " +
        "For an enum-derived label use formatStatusLabel(key) " +
        "(@plugins/primitives/plugins/css/plugins/badge/web); for a model name use the model registry label " +
        '("Opus 4.8"); for an intentional all-caps alarm author the literal string ("BYPASS ACTIVE"). ' +
        "Last resort: // eslint-disable-next-line badge/no-badge-text-transform -- <reason>.",
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      JSXAttribute(node) {
        if (node.name.type !== "JSXIdentifier" || node.name.name !== "className") return;

        // Only `<Badge className=...>` — the primitive's own markup renders a
        // lowercase host tag, so its internal text-transform (if any) is fine.
        const tag = node.parent.name;
        if (tag.type !== "JSXIdentifier" || tag.name !== "Badge") return;

        const tokens = new Set<string>();
        collectTokens(node.value, tokens);

        for (const t of tokens) {
          if (isTextTransform(t)) {
            context.report({ node, messageId: "textTransform" });
            return;
          }
        }
      },
    };
  },
});
