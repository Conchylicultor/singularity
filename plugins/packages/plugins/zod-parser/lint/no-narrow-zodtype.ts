/**
 * Bans the ONE-argument `ZodType<T>` / `z.ZodType<T>`.
 *
 * In zod v3 the type takes three parameters — `ZodType<Output, Def, Input>` —
 * and `Input` **defaults to `Output`**. So `ZodType<T>` silently expands to
 * `ZodType<T, ZodTypeDef, T>`: a claim that the value going *in* is already a
 * `T`. At a parse boundary — a jsonb column, a request body, a WebSocket
 * payload — that claim is false, and it excludes exactly the combinators that
 * bridge the gap between wire shape and row shape: `.default()`, `.catch()`,
 * `.coerce`, `.transform()`, `.preprocess()`.
 *
 * The loud version of that is a type error people route around with
 * `.optional()` plus a hand-written normalizer, or an `as unknown as` cast —
 * nine such workarounds accumulated across seven plugins before the alias
 * existed. The quiet version is worse: where a type *infers through*
 * `ZodType<infer U>`, a wide-input schema does not error at all — `U` resolves
 * to the schema's **input** type, so the consumer is handed a row type that
 * disagrees with what `.parse()` returns.
 *
 * Both are the same missing third parameter, so the rule fires on the shape
 * rather than on the position: any `ZodType<…>` carrying exactly one type
 * argument. Zero arguments (`z.ZodType` as a bare constraint) and three
 * arguments (the explicit form) are fine.
 *
 * Not type-aware, and deliberately name-based: the rule matches the right-most
 * identifier of the type name, so `ZodType<T>` and `z.ZodType<T>` both fire.
 * Self-contained by necessity — the ESLint config loads rule files through
 * jiti, which cannot resolve `@plugins/*`.
 */
import {
  AST_NODE_TYPES,
  ESLintUtils,
  type TSESTree,
} from "@typescript-eslint/utils";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/anthropics/singularity/lint/${name}`,
);

/** Right-most identifier of a `ZodType` / `z.ZodType` type-reference name. */
function typeNameIsZodType(name: TSESTree.EntityName): boolean {
  if (name.type === AST_NODE_TYPES.Identifier) return name.name === "ZodType";
  if (name.type === AST_NODE_TYPES.TSQualifiedName)
    return name.right.name === "ZodType";
  return false;
}

export default createRule({
  name: "no-narrow-zodtype",
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow the one-argument `ZodType<T>`, which silently asserts the parsed input is already a `T` — use `ZodParser<T>`, or spell all three type parameters.",
    },
    schema: [],
    messages: {
      narrowZodType:
        "`ZodType<T>` means `ZodType<T, ZodTypeDef, T>` — `Input` defaults to `Output`, so this asserts the " +
        "value being parsed is already a `T`. At a parse boundary that is false, and it excludes `.default()`, " +
        "`.catch()`, `.coerce`, `.transform()` and `.preprocess()`. Use `ZodParser<T>` from " +
        "`@plugins/packages/plugins/zod-parser/core`; if the input genuinely equals the output, spell all three " +
        "parameters (`z.ZodType<T, z.ZodTypeDef, T>`) so the claim is on the page.",
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      TSTypeReference(node) {
        if (!typeNameIsZodType(node.typeName)) return;
        if (node.typeArguments?.params.length !== 1) return;
        context.report({ node, messageId: "narrowZodType" });
      },
    };
  },
});
