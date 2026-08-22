import type { TSESLint, TSESTree } from "@typescript-eslint/utils";

/**
 * The ONE class-token walk, shared by every `no-adhoc-*` class rule.
 *
 * ## Why this is injected rather than imported
 *
 * A `plugins/<name>/lint/*.ts` rule file is dual-loaded: under **jiti** (which
 * loads `eslint.config.ts` and cannot resolve the `@plugins/*` tsconfig alias)
 * and under **Bun** (the type-check worker, where the alias works). So a rule
 * file cannot `import` a runtime value from another plugin — which is why this
 * walk used to be hand-copied into seventeen rule files, six of them fenced by
 * sentinels and held together by a byte-comparison check while the other eleven
 * silently drifted onto an older, weaker copy that resolved no identifiers at
 * all.
 *
 * The constraint binds runtime values only. **jiti erases `import type`**, so a
 * rule file takes the TYPE from here and the VALUE by injection: it default-
 * exports a factory `(toolkit: LintToolkit) => rule`, its plugin's `lint/index.ts`
 * lists it under `classRules`, and `buildLintConfig` calls it with the toolkit
 * built here. Rule files must therefore write `import type { … }` — never
 * `import { type … }`, which `verbatimModuleSyntax` can preserve as a runtime
 * import that jiti would then try (and fail) to resolve.
 *
 * A rule that declared its own walk would be back where we started, so
 * `./singularity check class-token-walk-single-source` fails if any rule file
 * declares one.
 */

/**
 * JSX attribute names whose value is a class-name string. `className`/`class`
 * are React's and HTML's own; the `*ClassName` suffix is the pass-through
 * convention (`panelClassName`, `itemClassName`, `wrapperClassName`,
 * `trackClassName`) a component uses to forward classes to an inner element.
 * Those forwarded strings style a real element exactly like `className` does.
 */
export const CLASS_ATTRS = /^(?:class|className)$|ClassName$/;

/** Class-builder calls whose string arguments are class-name strings. */
export const CLASS_BUILDERS = new Set(["cn", "clsx", "twMerge"]);

/**
 * Strip Tailwind variant prefixes (`hover:`, `md:`, …) AND a leading `-`
 * (negative offsets like `-inset-1`) so the utility underneath is tested on its
 * own. Variants are colon-delimited; the utility is the LAST `:`-segment.
 */
export function baseClass(token: string): string {
  const idx = token.lastIndexOf(":");
  const bare = idx === -1 ? token : token.slice(idx + 1);
  return bare.startsWith("-") ? bare.slice(1) : bare;
}

/**
 * Recursively harvest class-name tokens from a class-value subtree into `out`.
 *
 * Directly contained strings are harvested wherever they sit: bare `Literal`
 * `.value`s and `TemplateElement.value.raw`s (split on whitespace), inside
 * `cn(...)`/`clsx(...)` calls, ternaries, `clsx({ "text-x": cond })` object
 * keys, and arbitrary nesting — the walk is structural, not shape-specific.
 *
 * It ALSO follows same-file aliases: an `Identifier` reached from a class
 * context is resolved to its declaration, and a **string**, **template**,
 * **object-literal** or **array-literal** initializer is harvested too. Both
 * indirections are load-bearing:
 *
 *   - a MAP indexed in a class context (`cn(TONE[tone])`, `styles.title`) is how
 *     a banned class hides in a style/tone table;
 *   - a standalone string `const` referenced from a class context is how a
 *     banned class hides one hoist away. That hoist is not hypothetical: an
 *     author wrote `const ANCHOR_COLUMN = "block-anchor absolute z-raised"`
 *     specifically because a class literal inline in the JSX would be reported.
 *     A rule anchored on a position teaches authors where the position isn't, so
 *     the walk follows the value instead of guarding the position.
 *
 * A styling-FUNCTION result (`cva(...)`) is deliberately not followed — its
 * output is not a value this walk can read. Resolution is same-file only (an
 * imported or parameter binding has no in-file initializer) and cycle-guarded
 * via `seen`. Because the walk only ever starts from a real class-name context,
 * an unrelated doc-string that merely mentions `text-sm` is never inspected.
 */
export function collectTokens(
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
        const init = def.type === "Variable" ? def.node.init : null;
        if (
          init &&
          (init.type === "Literal" ||
            init.type === "TemplateLiteral" ||
            init.type === "ObjectExpression" ||
            init.type === "ArrayExpression")
        ) {
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


/** A harvested token paired with the node it came from, for rules that report
 *  the offending node (an autofix target, a specific branch) rather than a name. */
export interface TokenNode {
  token: string;
  node: TSESTree.Node;
}

/**
 * The node-yielding sibling of {@link collectTokens}: same traversal, same
 * alias policy, but each token carries the node it was harvested from.
 *
 * Two rules need this — one autofixes the class it reports, one reports the
 * guarded branch a class sits in — and before this existed they each hand-rolled
 * it, which is how the string walk grew seventeen copies in the first place. A
 * token reached through an alias is reported at the initializer it was found in,
 * which is a real location in the same file.
 */
export function collectTokenNodes(
  sourceCode: TSESLint.SourceCode,
  node: TSESTree.Node | null | undefined,
  out: TokenNode[],
  seen: Set<unknown> = new Set(),
): void {
  if (!node) return;
  if (node.type === "Literal") {
    if (typeof node.value === "string") {
      for (const t of node.value.split(/\s+/)) if (t) out.push({ token: t, node });
    }
    return;
  }
  if (node.type === "TemplateElement") {
    for (const t of node.value.raw.split(/\s+/)) if (t) out.push({ token: t, node });
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
        const init = def.type === "Variable" ? def.node.init : null;
        if (
          init &&
          (init.type === "Literal" ||
            init.type === "TemplateLiteral" ||
            init.type === "ObjectExpression" ||
            init.type === "ArrayExpression")
        ) {
          collectTokenNodes(sourceCode, init, out, seen);
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
          collectTokenNodes(sourceCode, child as TSESTree.Node, out, seen);
        }
      }
    } else if (value && typeof value === "object" && "type" in value) {
      collectTokenNodes(sourceCode, value as TSESTree.Node, out, seen);
    }
  }
}

/**
 * What a class rule is handed instead of hand-copying the walk. Rule files
 * import this TYPE (erased by jiti) and receive the values from
 * `buildLintConfig`.
 */
export interface LintToolkit {
  collectTokens: typeof collectTokens;
  collectTokenNodes: typeof collectTokenNodes;
  baseClass: typeof baseClass;
  CLASS_ATTRS: typeof CLASS_ATTRS;
  CLASS_BUILDERS: typeof CLASS_BUILDERS;
}

/** The single toolkit instance handed to every class-rule factory. */
export const lintToolkit: LintToolkit = {
  collectTokens,
  collectTokenNodes,
  baseClass,
  CLASS_ATTRS,
  CLASS_BUILDERS,
};

/** A rule module that must be constructed with the shared toolkit. */
export type ClassRuleFactory<TRule> = (toolkit: LintToolkit) => TRule;
