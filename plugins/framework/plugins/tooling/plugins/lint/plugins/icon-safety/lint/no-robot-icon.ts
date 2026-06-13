import { ESLintUtils } from "@typescript-eslint/utils";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/anthropics/singularity/lint/${name}`,
);

// The SmartToy robot-face icon from react-icons/md looks cheap and
// unprofessional, and agents keep reaching for it to represent agents/AI.
// Match every Material variant (Outlined/Rounded/Sharp/TwoTone) of it.
const ROBOT_ICON_RE = /^Md(Outlined|Rounded|Sharp|TwoTone)?SmartToy$/;

export default createRule({
  name: "no-robot-icon",
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow the MdSmartToy robot icon — use MdAutoAwesome to represent agents/AI.",
    },
    schema: [],
    messages: {
      robotIcon:
        "Robot icon '{{name}}' is banned — it looks unprofessional. " +
        "Use 'MdAutoAwesome' to represent agents/AI (the codebase's canonical AI glyph).",
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      ImportDeclaration(node) {
        if (node.source.value !== "react-icons/md") return;
        for (const spec of node.specifiers) {
          if (
            spec.type === "ImportSpecifier" &&
            spec.imported.type === "Identifier" &&
            ROBOT_ICON_RE.test(spec.imported.name)
          ) {
            context.report({
              node: spec,
              messageId: "robotIcon",
              data: { name: spec.imported.name },
            });
          }
        }
      },
    };
  },
});
