import { ESLintUtils, type TSESTree } from "@typescript-eslint/utils";
import { locate, ownTargetOf, toPosix } from "./own-tree";

/**
 * no-cross-runtime-import
 *
 * Inside ONE plugin's own tree: `web/` and `core/` must never import from a
 * sibling `server/`, and `server/` must never import from a sibling `web/`. The
 * sanctioned cross-runtime channels are `core/` (public) and `shared/`
 * (private) — a symbol both runtimes need belongs in one of those.
 *
 * The `plugin-boundaries` check owns the CROSS-plugin import grammar, but it
 * only resolves alias specifiers (`@plugins/…`) through its zone map; a
 * relative `../server/x` inside a single plugin is invisible to it. That hole
 * shipped a real defect: `conversations/core/index.ts` opened with
 * `export { isActiveStatus, hasLiveProcess } from "../server/status"`, so the
 * plugin's browser `core` artifact silently BUNDLED a file out of `server/` —
 * and, because an artifact's address hashes only the folders it is supposed to
 * inline (`core/`, `shared/`), the bundle's address never covered that file:
 * editing it left the content-addressed store answering "unchanged" and serving
 * the stale artifact forever
 * (`research/2026-08-17-global-artifact-address-covers-content.md`).
 *
 * Type-only imports are banned too, by the same argument: a type both runtimes
 * need belongs in `core/`, and exempting types would leave the invariant
 * readable as "sometimes".
 *
 * It also bans every runtime importing its own `provision/`. Provisioning
 * downloads and installs — work no request path may ever start. `boundary-config`
 * says the same thing for the cross-plugin case, but its evaluator short-circuits
 * when source and target are the SAME plugin, so a plugin reaching into its own
 * install step is exactly the edge only this rule can see. That is not
 * hypothetical: the chromium installer sat in `browser-fetch/core` and a render
 * path called it, blocking a backend's event loop on a ~150 MB download.
 *
 * Scope is INTRA-plugin only. A cross-plugin `@plugins/other/server` import is a
 * different question, decided by the boundary config, and this rule ignores it.
 */

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/anthropics/singularity/lint/${name}`,
);

/** Which sibling runtime folders a given runtime folder may not import from. */
const FORBIDDEN: Record<string, ReadonlySet<string>> = {
  web: new Set(["server", "provision"]),
  core: new Set(["server", "provision"]),
  server: new Set(["web", "provision"]),
  central: new Set(["web", "provision"]),
};

export default createRule({
  name: "no-cross-runtime-import",
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow a plugin's web/ or core/ importing its own server/ (and server/ " +
        "importing its own web/) — the cross-runtime channels are core/ and shared/ — " +
        "and disallow any runtime importing its own provision/, which is install-time " +
        "only.",
    },
    schema: [],
    messages: {
      crossRuntime:
        '`{{from}}/` must not import this plugin\'s own `{{to}}/` (import "{{specifier}}"). ' +
        "This edge drags one runtime's source into the other's build — a core barrel " +
        "sourcing from server/ put server code in browser artifacts, under an address " +
        "that never hashed it, so the artifact fossilised. Move the symbol to `core/` " +
        "(public) or `shared/` (plugin-private). Type-only imports included: a type both " +
        "runtimes need belongs in core/.",
      provisionEdge:
        '`{{from}}/` must not import this plugin\'s own `provision/` (import "{{specifier}}"). ' +
        "A provisioning step downloads and installs; it runs once at postinstall, with no " +
        "backend alive. Calling one from a runtime is how a request path came to block a " +
        "whole event loop on a ~150 MB browser download. If the binary or asset is missing " +
        "at runtime, FAIL and name the command that provisions it.",
    },
  },
  defaultOptions: [],
  create(context) {
    const file = toPosix(context.filename ?? context.getFilename?.() ?? "");
    const source = locate(file);
    if (source === null) return {};
    const forbidden = FORBIDDEN[source.folder];
    if (forbidden === undefined) return {};

    const report = (node: TSESTree.Node, specifier: string): void => {
      const folder = ownTargetOf(specifier, file, source)?.folder ?? null;
      if (folder === null || !forbidden.has(folder)) return;
      context.report({
        node,
        messageId: folder === "provision" ? "provisionEdge" : "crossRuntime",
        data: { from: source.folder, to: folder, specifier },
      });
    };

    const checkDeclaration = (
      node:
        | TSESTree.ImportDeclaration
        | TSESTree.ExportNamedDeclaration
        | TSESTree.ExportAllDeclaration,
    ): void => {
      if (node.source == null) return;
      report(node, node.source.value);
    };

    return {
      // Every spelling of a module edge — `export … from` is how the real
      // violation was written, and a re-export is exactly as load-bearing as an
      // import for what ends up in the bundle.
      ImportDeclaration: checkDeclaration,
      ExportNamedDeclaration: checkDeclaration,
      ExportAllDeclaration: checkDeclaration,
      ImportExpression: (node: TSESTree.ImportExpression): void => {
        if (
          node.source.type !== "Literal" ||
          typeof node.source.value !== "string"
        )
          return;
        report(node, node.source.value);
      },
    };
  },
});
