import { ESLintUtils, type TSESTree } from "@typescript-eslint/utils";

/**
 * no-module-mutable-store
 *
 * Bans the hand-rolled module-level mutable external store ANYWHERE in the repo:
 * a module-scope `let`/`var` holding the store's value, a sibling listener `Set`,
 * and a `useSyncExternalStore` whose snapshot reads that `let`/`var` back.
 *
 *   let cursorBeat = 0;                       // ← the store value (module-global)
 *   const listeners = new Set<() => void>();
 *   const getSnapshot = () => cursorBeat;
 *   useSyncExternalStore(subscribe, getSnapshot);
 *
 * A module-level binding is PROCESS-GLOBAL, so a single value is SHARED across
 * every surface instance. Surfaces now mount multiple times at once (desktop
 * multi-window, keep-alive tabs), so such a store tears — playback, cursors, view
 * state bleed between windows. This rule is the sanctioned home of the
 * `scoped-store` primitive (the per-surface replacement), so it lives here and
 * runs repo-wide — not just inside app surface trees.
 *
 * DETECTION — deliberately narrow (a false positive breaks the build, since
 * plugin rules run as `error`; a false negative merely misses an evasive case):
 *
 *   The file must call `useSyncExternalStore`, AND a module-scope `let`/`var`
 *   binding must be READ inside that call's snapshot argument(s) — the
 *   getSnapshot / getServerSnapshot closures (args[1] / args[2]). That binding
 *   IS the shared store value: the snapshot returns it. We report on its
 *   declaration.
 *
 * The "snapshot reads the binding" test is what distinguishes the anti-pattern
 * from a legitimate KEYED store, e.g.
 * `surface-arrangement/.../use-window-geometry.ts`, whose store value is a
 * `const` `Map`/`Set` keyed by surface id (the snapshot reads the keyed map, NOT
 * a `let`); its module `let`s (`nextZ`, `hydrated`) are auxiliary counters/flags
 * never returned as the snapshot, so they are correctly NOT flagged. A bare
 * module `let` with no `useSyncExternalStore` is likewise out of scope.
 *
 * KNOWN LIMITATION: the rule cannot catch the *keyed-`const`-Map by a
 * non-surface-unique key* variant — a `const Map` keyed by, say, a `paneId`
 * string that is identical across surfaces still bleeds, but is statically
 * indistinguishable from a `Map` correctly keyed by a surface id. Those cases
 * are caught in review, not here.
 *
 * Escape hatch — a genuinely process-global store (one value for the whole page,
 * by design: a focused-surface signal, a server boot fact, a cross-surface
 * registry) disables this per-site with a reason:
 *
 *   // eslint-disable-next-line scoped-store/no-module-mutable-store -- <reason>
 */

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/anthropics/singularity/lint/${name}`,
);

/** Is this an enclosing-scope node a module-scope `let`/`var` declaration lives at? */
function isProgramScopeDeclaration(decl: TSESTree.VariableDeclaration): boolean {
  // Bare module statement, or one fronted by an `export` — both sit at Program.
  const parent = decl.parent;
  if (parent.type === "Program") return true;
  if (
    (parent.type === "ExportNamedDeclaration" ||
      parent.type === "ExportDefaultDeclaration") &&
    parent.parent.type === "Program"
  ) {
    return true;
  }
  return false;
}

/** The simple callee name of a call, or null. */
function calleeName(node: TSESTree.CallExpression): string | null {
  const callee = node.callee;
  if (callee.type === "Identifier") return callee.name;
  if (callee.type === "MemberExpression" && callee.property.type === "Identifier") {
    return callee.property.name;
  }
  return null;
}

/** Collect every Identifier name read anywhere inside a subtree. */
function collectIdentifierNames(node: TSESTree.Node, out: Set<string>): void {
  const visit = (n: unknown): void => {
    if (!n || typeof n !== "object") return;
    if (Array.isArray(n)) {
      for (const c of n) visit(c);
      return;
    }
    const rec = n as Record<string, unknown> & { type?: string };
    if (typeof rec.type !== "string") return;
    if (rec.type === "Identifier" && typeof rec.name === "string") out.add(rec.name);
    for (const key of Object.keys(rec)) {
      if (key === "parent" || key === "type" || key === "loc" || key === "range") {
        continue;
      }
      visit(rec[key]);
    }
  };
  visit(node);
}

export default createRule({
  name: "no-module-mutable-store",
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow a module-level mutable store (a module-scope `let`/`var` read " +
        "by a `useSyncExternalStore` snapshot) — it is shared across all surface " +
        "instances. Use defineScopedStore for per-surface state.",
    },
    schema: [],
    messages: {
      moduleMutableStore:
        "Module-level mutable store (`let`/`var` `{{name}}` read by a " +
        "`useSyncExternalStore` snapshot) is shared across ALL mounted surfaces — " +
        "desktop / keep-alive mounts surfaces multiple times at once, so state " +
        "bleeds between windows. Use defineScopedStore " +
        "(@plugins/primitives/plugins/scoped-store/web) so state is per-surface. " +
        "For a genuinely page-global store, disable this rule on the line with " +
        "a reason (`-- <why this is intentionally global>`).",
    },
  },
  defaultOptions: [],
  create(context) {
    /**
     * Resolve a same-file binding name to the node whose body reads the store
     * value: a `function getSnapshot() { return state; }` declaration, or a
     * `const getSnapshot = () => state` initializer. Returns null for anything
     * else (imported / parameter / non-function binding) — favoring false
     * negatives, per the rule's narrow contract.
     */
    function resolveModuleBinding(name: string): TSESTree.Node | null {
      const moduleScope = context.sourceCode.scopeManager?.globalScope?.childScopes.find(
        (s) => s.type === "module",
      );
      const scope = moduleScope ?? context.sourceCode.scopeManager?.globalScope;
      const variable = scope?.variables.find((v) => v.name === name);
      if (!variable) return null;
      for (const def of variable.defs) {
        if (def.type === "FunctionName") return def.node;
        if (def.type === "Variable" && def.node.init) {
          const init = def.node.init;
          if (
            init.type === "ArrowFunctionExpression" ||
            init.type === "FunctionExpression"
          ) {
            return init;
          }
        }
      }
      return null;
    }

    // Module-scope `let`/`var` declarations, by bound name → declaration node.
    const mutableBindings = new Map<string, TSESTree.VariableDeclaration>();
    // Snapshot argument expressions of every `useSyncExternalStore` call, in
    // source order — resolved (named identifier → its definition) in Program:exit
    // once the whole file (and its function declarations) has been collected.
    const snapshotArgs: TSESTree.Node[] = [];

    return {
      VariableDeclaration(node) {
        if (node.kind !== "let" && node.kind !== "var") return;
        if (!isProgramScopeDeclaration(node)) return;
        for (const decl of node.declarations) {
          if (decl.id.type === "Identifier") mutableBindings.set(decl.id.name, node);
        }
      },
      CallExpression(node) {
        if (calleeName(node) !== "useSyncExternalStore") return;
        // useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot?).
        // The snapshot argument(s) read the store value back.
        for (const arg of node.arguments.slice(1, 3)) {
          if (arg) snapshotArgs.push(arg);
        }
      },
      "Program:exit"() {
        // Names read by any snapshot. A snapshot arg is either an inline
        // arrow/function expression (walk its body) or an Identifier naming a
        // module function/const (`getSnapshot`, `getCursorBeat`) — resolve it to
        // its definition and walk that body too, one hop (the snapshot itself
        // returns the store value; we don't chase arbitrary call graphs).
        const snapshotRefs = new Set<string>();
        for (const arg of snapshotArgs) {
          collectIdentifierNames(arg, snapshotRefs);
          if (arg.type === "Identifier") {
            const def = resolveModuleBinding(arg.name);
            if (def) collectIdentifierNames(def, snapshotRefs);
          }
        }

        // A `let`/`var` whose binding is read by a snapshot IS the shared store
        // value. Report each once, on its declaration (dedup by node).
        const reported = new Set<TSESTree.VariableDeclaration>();
        for (const [name, decl] of mutableBindings) {
          if (!snapshotRefs.has(name)) continue;
          if (reported.has(decl)) continue;
          reported.add(decl);
          context.report({
            node: decl,
            messageId: "moduleMutableStore",
            data: { name },
          });
        }
      },
    };
  },
});
