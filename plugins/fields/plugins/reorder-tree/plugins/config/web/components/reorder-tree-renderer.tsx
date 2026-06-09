import {
  FieldHeader,
  type FieldRendererComponent,
} from "@plugins/config_v2/plugins/fields/web";
import {
  reorderTreeFieldType,
  type ReorderNode,
  type ReorderTree,
} from "@plugins/fields/plugins/reorder-tree/core";
import { normalizeNode } from "../../core";

function NodeRows({ nodes }: { nodes: readonly ReorderNode[] }) {
  return (
    <>
      {nodes.map((node, i) => {
        const n = normalizeNode(node);
        if (n.kind === "spacer") {
          return (
            <div
              key={`spacer-${n.spacer}-${i}`}
              className="px-2 py-1 text-xs italic text-muted-foreground"
            >
              — spacer —
            </div>
          );
        }
        if (n.kind === "group") {
          return (
            <div key={`group-${n.group}-${i}`} className="flex flex-col">
              <div className="px-2 py-1 text-sm font-medium">{n.group}</div>
              <div className="ml-3 border-l border-border pl-2">
                <NodeRows nodes={n.items} />
              </div>
            </div>
          );
        }
        return (
          <div
            key={`item-${n.item}-${i}`}
            className={`px-2 py-1 font-mono text-sm ${
              n.hidden ? "text-muted-foreground line-through" : ""
            }`}
          >
            {n.item}
          </div>
        );
      })}
    </>
  );
}

const ReorderTreeRenderer: FieldRendererComponent<ReorderTree> = ({
  field,
  value,
}) => {
  return (
    <div className="flex flex-col gap-1.5 py-3">
      <FieldHeader field={field} />
      {value.length === 0 ? (
        <p className="px-2 py-1 text-sm text-muted-foreground">No items.</p>
      ) : (
        <div className="flex flex-col rounded-lg border border-input">
          <NodeRows nodes={value} />
        </div>
      )}
    </div>
  );
};
ReorderTreeRenderer.type = reorderTreeFieldType;

export { ReorderTreeRenderer };
