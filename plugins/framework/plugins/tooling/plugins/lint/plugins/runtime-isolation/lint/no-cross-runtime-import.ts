import { ESLintUtils, type TSESTree } from "@typescript-eslint/utils";

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
 * Scope is INTRA-plugin only. A cross-plugin `@plugins/other/server` import is a
 * different question, decided by the boundary config, and this rule ignores it.
 */

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/anthropics/singularity/lint/${name}`,
);

/** Which sibling runtime folders a given runtime folder may not import from. */
const FORBIDDEN: Record<string, ReadonlySet<string>> = {
  web: new Set(["server"]),
  core: new Set(["server"]),
  server: new Set(["web"]),
};

/** Normalize a path to `/` separators (the rule reasons in posix segments). */
function toPosix(p: string): string {
  return p.split("\\").join("/");
}

/**
 * Walk the alternating `<name>(/plugins/<name>)*` grammar a plugin dir follows,
 * from `segs[start]`, and return the index of the plugin dir's LAST segment.
 * The plugin dir ends at the first non-`plugins` interstitial — a runtime folder.
 */
function pluginDirEnd(segs: string[], start: number): number {
  let i = start;
  while (segs[i + 1] === "plugins" && segs[i + 2] !== undefined) i += 2;
  return i;
}

/** The plugin dir and the runtime folder of an absolute source file, if any. */
function locate(absPath: string): { pluginDir: string; folder: string } | null {
  const segs = toPosix(absPath).split("/");
  const pluginsRoot = segs.indexOf("plugins");
  if (pluginsRoot === -1 || segs[pluginsRoot + 1] === undefined) return null;
  const end = pluginDirEnd(segs, pluginsRoot + 1);
  const folder = segs[end + 1];
  if (folder === undefined) return null;
  return { pluginDir: segs.slice(0, end + 1).join("/"), folder };
}

/**
 * Resolve a relative specifier against the importing file — pure segment
 * arithmetic, so the rule stays dependency-free like its siblings (no node:path,
 * no filesystem: the folder names are all this rule needs).
 */
function resolveRelative(fromFile: string, specifier: string): string {
  const out = toPosix(fromFile).split("/").slice(0, -1);
  for (const seg of specifier.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") out.pop();
    else out.push(seg);
  }
  return out.join("/");
}

/**
 * The runtime folder a specifier names WITHIN the importing file's own plugin,
 * or null when the specifier leaves the plugin (or is a bare npm package).
 */
function ownFolderOf(
  specifier: string,
  file: string,
  source: { pluginDir: string },
): string | null {
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    const target = locate(resolveRelative(file, specifier));
    return target !== null && target.pluginDir === source.pluginDir
      ? target.folder
      : null;
  }
  if (!specifier.startsWith("@plugins/")) return null;
  // The plugin's own absolute self-specifier: `@plugins/<own path>/<folder>`.
  const segs = specifier.slice("@plugins/".length).split("/");
  const end = pluginDirEnd(segs, 0);
  const folder = segs[end + 1];
  if (folder === undefined) return null;
  const pluginPath = segs.slice(0, end + 1).join("/");
  return source.pluginDir.endsWith(`/plugins/${pluginPath}`) ? folder : null;
}

export default createRule({
  name: "no-cross-runtime-import",
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow a plugin's web/ or core/ importing its own server/ (and server/ " +
        "importing its own web/) — the cross-runtime channels are core/ and shared/.",
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
      const folder = ownFolderOf(specifier, file, source);
      if (folder === null || !forbidden.has(folder)) return;
      context.report({
        node,
        messageId: "crossRuntime",
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
