import { useMemo } from "react";
import {
  FieldHeader,
  type FieldRendererComponent,
} from "@plugins/config_v2/plugins/fields/web";
import {
  reorderTreeFieldType,
  type ReorderTree,
} from "@plugins/fields/plugins/reorder-tree/core";
import {
  ReorderEditor,
  SortableReorderItem,
  type ReorderEntry,
} from "@plugins/reorder/plugins/editor/web";
import {
  treeToView,
  reorderTree,
  hideInTree,
  restoreInTree,
  addSpacer,
  deleteSpacer,
} from "./tree-ops";

// Full drag editor for a reorder-tree field in the Config settings pane. It maps
// the saved `ReorderTree` into the shared `<ReorderEditor>` (reorder, hide/restore,
// add/remove spacer) and persists every edit via the field's `onChange`. There's
// no live catalog here, so items are labeled by their raw `entryKey` string.
const ReorderTreeRenderer: FieldRendererComponent<ReorderTree> = ({
  field,
  value,
  onChange,
}) => {
  const { entries, hiddenItems } = useMemo(() => {
    const view = treeToView(value);
    const editorEntries: ReorderEntry[] = view.entries.map((e) =>
      e.kind === "spacer"
        ? { kind: "spacer", id: e.id }
        : {
            kind: "item",
            id: e.id,
            node: (
              <SortableReorderItem itemKey={e.id} editMode label={e.id}>
                <span className="px-2 py-1 font-mono text-sm">{e.id}</span>
              </SortableReorderItem>
            ),
          },
    );
    return { entries: editorEntries, hiddenItems: view.hiddenItems };
  }, [value]);

  return (
    <div className="flex flex-col gap-1.5 py-3">
      <FieldHeader field={field} />
      <ReorderEditor
        entries={entries}
        hiddenItems={hiddenItems}
        onDrop={(a, o) => onChange(reorderTree(value, a, o))}
        onHide={(k) => onChange(hideInTree(value, k))}
        onRestore={(k) => onChange(restoreInTree(value, k))}
        onAddSpacer={() => onChange(addSpacer(value))}
        onDeleteSpacer={(id) => onChange(deleteSpacer(value, id))}
        editMode
        orientation="vertical"
      />
    </div>
  );
};

ReorderTreeRenderer.type = reorderTreeFieldType;

export { ReorderTreeRenderer };
