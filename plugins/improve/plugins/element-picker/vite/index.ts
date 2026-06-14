// element-picker's build-time contribution: a source-location Babel plugin.
//
// `web-core/vite.config.ts` discovers every `**/vite/index.ts` generically (it
// never names this plugin) and passes each default export's result to
// `@vitejs/plugin-react`'s `babel.plugins`. The transform stamps host DOM
// elements with `data-source="<file>:<line>"`; the element-picker read side
// emits that as the `source=` attribute on the picked `<ui-context …>` tag, so a
// picked element resolves to the exact `file:line` it renders from — even plain
// JSX with no slot contribution boundary (e.g. a `<button>` inside
// `launch-control.tsx`).
//
// Presence of this folder == presence of the source attributes: removing the
// element-picker plugin removes the `vite/` folder, the glob finds nothing, and
// React runs with no extra babel plugin (no `data-source` stamping).
//
// CONSTRAINTS — kept fully self-contained (single file, no sibling imports) and
// with ZERO `@plugins` / `@babel/*` imports on purpose: this module is loaded by
// `vite.config.ts` via a runtime dynamic `import()` of its absolute path, where
// neither the `@plugins` alias nor extensionless `.ts` sibling resolution is
// available. Only `node:path` is imported; the babel `types` factory is handed in
// at runtime.

import { relative, sep } from "node:path";

// Minimal structural types for the babel surface we touch (we don't import
// `@babel/types`, see CONSTRAINTS above).
interface BabelTypes {
  jsxAttribute(name: JSXIdentifier, value: StringLiteral): JSXAttribute;
  jsxIdentifier(name: string): JSXIdentifier;
  stringLiteral(value: string): StringLiteral;
}
interface JSXIdentifier {
  type: "JSXIdentifier";
  name: string;
}
interface StringLiteral {
  type: "StringLiteral";
}
interface JSXAttribute {
  type: "JSXAttribute";
  name: { type: "JSXIdentifier" | "JSXNamespacedName"; name?: string };
}
interface SourceLocation {
  start: { line: number };
}
interface JSXOpeningElementNode {
  name: { type: string; name?: string };
  attributes: Array<JSXAttribute | { type: string }>;
  loc?: SourceLocation | null;
}
interface VisitorPath<N> {
  node: N;
}
interface PluginPass {
  filename?: string | null;
}
interface BabelPluginObject {
  name: string;
  visitor: {
    JSXOpeningElement(
      path: VisitorPath<JSXOpeningElementNode>,
      state: PluginPass,
    ): void;
  };
}

const SOURCE_ATTR = "data-source";

/**
 * Factory consumed by the vite config. `repoRoot` lets the transform compute
 * repo-relative paths. Returns a babel plugin function `({ types }) => pluginObj`
 * accepted by `react({ babel: { plugins: [...] } })`, which stamps
 * `data-source="<repo-relative-posix-path>:<line>"` on host JSX elements.
 */
export default function sourceLocationBabelPlugin({
  repoRoot,
}: {
  repoRoot: string;
}) {
  return function sourceLocationBabelPluginInner({
    types: t,
  }: {
    types: BabelTypes;
  }): BabelPluginObject {
    return {
      name: "element-picker-source-location",
      visitor: {
        JSXOpeningElement(path, state) {
          const node = path.node;
          const name = node.name;

          // Host elements only: lowercase JSXIdentifier (`<div>`, `<button>`).
          // Skip components (uppercase), member expressions (`<Foo.Bar>`), and
          // namespaced names (`<svg:path>`).
          if (
            name.type !== "JSXIdentifier" ||
            typeof name.name !== "string" ||
            !/^[a-z]/.test(name.name)
          ) {
            return;
          }

          // Idempotent: never double-stamp (e.g. across HMR re-transforms).
          for (const attr of node.attributes) {
            if (
              attr.type === "JSXAttribute" &&
              (attr as JSXAttribute).name.type === "JSXIdentifier" &&
              (attr as JSXAttribute).name.name === SOURCE_ATTR
            ) {
              return;
            }
          }

          const filename = state.filename;
          const loc = node.loc;
          if (!filename || !loc) return;

          const rel = relative(repoRoot, filename).split(sep).join("/");
          const value = `${rel}:${loc.start.line}`;

          node.attributes.push(
            t.jsxAttribute(t.jsxIdentifier(SOURCE_ATTR), t.stringLiteral(value)),
          );
        },
      },
    };
  };
}
