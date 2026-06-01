import { ESLintUtils } from "@typescript-eslint/utils";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/anthropics/singularity/lint/${name}`,
);

export default createRule({
  name: "no-lucide-react",
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow lucide-react imports — use react-icons/md instead.",
    },
    schema: [],
    messages: {
      lucideImport:
        "Import from 'lucide-react' is banned. Use 'react-icons/md' instead " +
        "(e.g. MdClose for X, MdCheck for Check, MdChevronRight for ChevronRight). " +
        "See plugins/framework/plugins/web-core/CLAUDE.md.",
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      ImportDeclaration(node) {
        if (node.source.value === "lucide-react") {
          context.report({ node, messageId: "lucideImport" });
        }
      },
    };
  },
});
