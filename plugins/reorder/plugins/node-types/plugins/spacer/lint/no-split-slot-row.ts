import { ESLintUtils, type TSESTree } from "@typescript-eslint/utils";

/**
 * no-split-slot-row
 *
 * Tripwire for splitting ONE row of contributions across two render slots so
 * that some of them can sit at the other end:
 *
 *   <Stack direction="row">
 *     <Fill><Conversation.Header.Render>…</Conversation.Header.Render></Fill>
 *     <Rigid><Conversation.HeaderEnd.Render>…</Conversation.HeaderEnd.Render></Rigid>  // <-- flagged
 *   </Stack>
 *
 * Position inside a slot is LAYOUT CONFIG, not slot structure: every
 * `defineRenderSlot` is reorderable, and its committed order file
 * (`config/<plugin>/<slot>.jsonc`) takes a `{ "type": "spacer", "id": "…" }`
 * node — a `flex-1` gap that pushes everything after it to the far end. A second
 * slot for "the ones on the right" duplicates the host, freezes the split in
 * code (a user can no longer drag an item across it), and moves every
 * contributor to a new slot. It is also the design an agent reaches for when it
 * has read the slot definition and the host but not the order file — this rule
 * exists because that happened (the conversation header grew a `HeaderEnd`).
 *
 * Detection is NAME-BASED and scope-local — no import or type resolution. Fires
 * when two `<X.Render>` elements of DIFFERENT slots sit in the same JSX tree (no
 * function boundary between them) and their nearest common ancestor is a
 * single-row container: `Line`, `Row`, `Bar`, `Inline`, `Cluster`,
 * `AdaptiveBar`, or a `Stack` with a literal `direction="row"`. Slots stacked
 * in a column, or rendered from separate render-props (a tree row's accent and
 * trailing callbacks), are separate regions and never trip it.
 *
 * A genuine multi-region row — groups that are different KINDS of thing, not
 * the same kind at a different position — escapes per-site:
 *   {/* eslint-disable-next-line spacer/no-split-slot-row -- <reason> *\/}
 */

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/anthropics/singularity/lint/${name}`,
);

/** Containers whose children are laid out on one horizontal line. */
const ROW_CONTAINERS = new Set([
  "Line",
  "Row",
  "Bar",
  "Inline",
  "Cluster",
  "AdaptiveBar",
]);

/** The slot expression of a `<X.Render>` tag (`X`), or null for any other tag. */
function renderSlotName(
  name: TSESTree.JSXTagNameExpression,
  sourceCode: { getText(node: TSESTree.Node): string },
): string | null {
  if (name.type !== "JSXMemberExpression") return null;
  if (name.property.name !== "Render") return null;
  return sourceCode.getText(name.object);
}

function isRowContainer(el: TSESTree.JSXElement): boolean {
  const name = el.openingElement.name;
  if (name.type !== "JSXIdentifier") return false;
  if (ROW_CONTAINERS.has(name.name)) return true;
  if (name.name !== "Stack") return false;
  return el.openingElement.attributes.some(
    (a) =>
      a.type === "JSXAttribute" &&
      a.name.type === "JSXIdentifier" &&
      a.name.name === "direction" &&
      a.value?.type === "Literal" &&
      a.value.value === "row",
  );
}

/**
 * The JSX elements enclosing `el`, innermost first, up to the edge of its JSX
 * tree. Crosses expression containers and the conditional forms that sit inside
 * them (`{cond && <A.Render/>}`), but stops at anything else — a function
 * boundary means a separate render (a render-prop callback), not a sibling.
 */
function jsxAncestors(el: TSESTree.JSXElement): TSESTree.JSXElement[] {
  const out: TSESTree.JSXElement[] = [];
  let node: TSESTree.Node | undefined = el.parent;
  while (node) {
    if (node.type === "JSXElement") out.push(node);
    else if (
      node.type !== "JSXFragment" &&
      node.type !== "JSXExpressionContainer" &&
      node.type !== "LogicalExpression" &&
      node.type !== "ConditionalExpression"
    )
      break;
    node = node.parent;
  }
  return out;
}

interface RenderSite {
  el: TSESTree.JSXElement;
  slot: string;
  ancestors: TSESTree.JSXElement[];
}

export default createRule({
  name: "no-split-slot-row",
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Disallow rendering two render slots side by side in one row — put a spacer node in the one slot's order config instead",
    },
    messages: {
      splitSlotRow:
        '`{{slot}}.Render` and `{{other}}.Render` share one row. To place some of a slot\'s items at the other end, keep ONE slot and add a spacer node to its order file (config/<plugin>/<slot>.jsonc): {"type": "spacer", "id": "<unique-id>"}. A second slot is only right when the groups are different kinds of thing, not the same kind at a different position.',
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    const sourceCode = context.sourceCode;
    const sites: RenderSite[] = [];
    return {
      JSXElement(el) {
        const slot = renderSlotName(el.openingElement.name, sourceCode);
        if (slot === null) return;
        sites.push({ el, slot, ancestors: jsxAncestors(el) });
      },
      "Program:exit"() {
        const reported = new Set<TSESTree.JSXElement>();
        for (let i = 0; i < sites.length; i++) {
          for (let j = i + 1; j < sites.length; j++) {
            const a = sites[i]!;
            const b = sites[j]!;
            if (a.slot === b.slot || reported.has(b.el)) continue;
            const common = a.ancestors.find((x) => b.ancestors.includes(x));
            if (!common || !isRowContainer(common)) continue;
            reported.add(b.el);
            context.report({
              node: b.el.openingElement,
              messageId: "splitSlotRow",
              data: { slot: b.slot, other: a.slot },
            });
          }
        }
      },
    };
  },
});
