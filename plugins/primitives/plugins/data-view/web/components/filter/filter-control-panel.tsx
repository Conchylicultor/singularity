import type { ReactNode } from "react";
import { MdBookmarkAdd, MdClose } from "react-icons/md";
import {
  ControlPanel,
  usePanelStack,
} from "@plugins/primitives/plugins/css/plugins/control-panel/web";
import { useFilterEditor } from "../../internal/use-filter-editor";
import { AddGroupRow } from "./add-filter-affordance";
import { FieldSearchList } from "./field-search-list";
import { FilterGroupPanel } from "./filter-group-panel";
import { FilterPresetSection, FilterSavePresetPanel } from "./presets";

/**
 * The filter control's panel body. Prop-less by contract — it reads the live
 * tree off `useFilterEditor()`, which reads the controller off
 * `useDataViewControls()`.
 *
 * With no rules yet it IS the search-first field list ("Filter by…" typeahead
 * over the schema fields): picking a field adds a rule in one click, and the
 * grouped path sits below the list. The tree materializes from a transient empty
 * root on that first edit, so opening with no filter commits nothing.
 *
 * Once populated it is the root group's page — the rule list plus its own
 * `Add filter` row — over a footer of Save-as-preset / Clear-filter ROWS. The
 * footer used to be two ghost buttons pushed to opposite corners, the left one
 * opening a popover inside the popover.
 */
export function FilterControlPanel(): ReactNode {
  const editor = useFilterEditor();
  const { push } = usePanelStack();
  const hasContent = editor.root.children.length > 0;

  return (
    <>
      <FilterPresetSection />

      {hasContent ? (
        <>
          <FilterGroupPanel groupId={editor.root.id} />
          <ControlPanel.Footer>
            <ControlPanel.Row
              icon={<MdBookmarkAdd />}
              onSelect={() =>
                push({
                  key: "save-filter-preset",
                  title: "Save as preset",
                  render: () => <FilterSavePresetPanel />,
                })
              }
            >
              Save as preset
            </ControlPanel.Row>
            {/* Clearing leaves the panel OPEN, on the field picker it started
                from. The panel is no longer the owner of its own popover — it is
                a prop-less body the toolbar mounts, and in the compact fold there
                is no popover to close at all — so "clear and dismiss" is not one
                gesture it can express in both layouts. */}
            <ControlPanel.Row
              icon={<MdClose />}
              tone="danger"
              onSelect={editor.clear}
            >
              Clear filter
            </ControlPanel.Row>
          </ControlPanel.Footer>
        </>
      ) : (
        <ControlPanel.Section>
          <FieldSearchList
            fields={editor.fields}
            onPick={(fieldId) =>
              editor.addRuleForField(editor.root.id, fieldId)
            }
            footer={
              <AddGroupRow onClick={() => editor.addGroup(editor.root.id)} />
            }
          />
        </ControlPanel.Section>
      )}
    </>
  );
}
