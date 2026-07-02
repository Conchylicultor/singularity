import { ESLintUtils } from "@typescript-eslint/utils";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/anthropics/singularity/lint/${name}`,
);

function isReactIcons(source: unknown): boolean {
  return typeof source === "string" && (source === "react-icons" || source.startsWith("react-icons/"));
}

// Namespace-importing react-icons (`import * as X from "react-icons/md"` or the
// bare dynamic `import("react-icons/md")`) indexes the module object at runtime,
// which defeats Rollup tree-shaking: the whole ~2 MB icon set is retained and
// hoisted into the eager entry chunk. Named imports (`import { MdFoo }`) stay
// tree-shakeable; display surfaces should render stored SvgNode data instead.
export default createRule({
  name: "no-namespace-react-icons",
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow namespace imports of react-icons — they defeat tree-shaking and force the whole icon set eager.",
    },
    schema: [],
    messages: {
      namespaceImport:
        "Namespace-importing react-icons retains the whole ~2 MB icon set and forces it into the eager entry chunk. " +
        "Import named icons ('import { MdFoo } from \"react-icons/md\"') or render stored SvgNode data (<SvgIcon/>) instead.",
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      ImportDeclaration(node) {
        if (!isReactIcons(node.source.value)) return;
        for (const spec of node.specifiers) {
          if (spec.type === "ImportNamespaceSpecifier") {
            context.report({ node: spec, messageId: "namespaceImport" });
          }
        }
      },
      ImportExpression(node) {
        if (node.source.type === "Literal" && isReactIcons(node.source.value)) {
          context.report({ node, messageId: "namespaceImport" });
        }
      },
    };
  },
});
