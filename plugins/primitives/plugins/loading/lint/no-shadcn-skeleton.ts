/**
 * The shadcn `components/ui/skeleton.tsx` was deleted — its shimmer atom lives
 * in the `loading` primitive (<Loading variant="block"> etc.). This rule keeps
 * the dead import path from being resurrected by a future shadcn re-generation
 * or copy-paste.
 */
import { ESLintUtils } from "@typescript-eslint/utils";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/anthropics/singularity/lint/${name}`,
);

export default createRule({
  name: "no-shadcn-skeleton",
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow imports of the deleted @/components/ui/skeleton — use the loading primitive instead.",
    },
    schema: [],
    messages: {
      shadcnSkeleton:
        "'@/components/ui/skeleton' was deleted. Use <Loading variant=\"block\"> (or rows/cards) from " +
        "@plugins/primitives/plugins/loading/web.",
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      ImportDeclaration(node) {
        if (node.source.value === "@/components/ui/skeleton") {
          context.report({ node, messageId: "shadcnSkeleton" });
        }
      },
    };
  },
});
