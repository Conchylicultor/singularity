import { ESLintUtils, type TSESTree } from "@typescript-eslint/utils";
import { isIconPicker, isReactIcons } from "./react-icons-source";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/anthropics/singularity/lint/${name}`,
);

/**
 * Icons are data: `symbol("…")` / `brand("…")` from `ui/icons/core`, drawn by
 * `<Icon>` in the style the theme scope picks. A react-icons component hard-codes
 * one style (and a second icon set beside the sprites), so it is banned
 * everywhere except `primitives/icon-picker`, whose saved-icon storage still
 * extracts `SvgNode`s from react-icons/md.
 */
export default createRule({
  name: "no-react-icons",
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow react-icons outside primitives/icon-picker — icons are symbol()/brand() IconRefs drawn by <Icon>.",
    },
    schema: [],
    messages: {
      reactIcons:
        'react-icons is not used for icons any more: name the glyph as data with symbol("…") (Material Symbols) or brand("…") (Simple Icons) ' +
        "from @plugins/ui/plugins/icons/core and draw it with <Icon icon={…}/> from @plugins/ui/plugins/icons/web. " +
        "A slot or prop takes `icon: IconRef`, never a component.",
    },
  },
  defaultOptions: [],
  create(context) {
    if (isIconPicker(context.filename)) return {};
    const check = (node: TSESTree.Node, source: unknown): void => {
      if (isReactIcons(source))
        context.report({ node, messageId: "reactIcons" });
    };
    return {
      ImportDeclaration(node) {
        check(node, node.source.value);
      },
      ExportNamedDeclaration(node) {
        if (node.source) check(node, node.source.value);
      },
      ExportAllDeclaration(node) {
        check(node, node.source.value);
      },
      ImportExpression(node) {
        if (node.source.type === "Literal") check(node, node.source.value);
      },
    };
  },
});
