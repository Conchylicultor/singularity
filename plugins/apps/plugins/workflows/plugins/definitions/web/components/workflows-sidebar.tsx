import { useMemo } from "react";
import { MdAdd, MdSchema } from "react-icons/md";
import { matchResource, useResource } from "@plugins/primitives/plugins/live-state/web";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { ControlSizeProvider } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { SidebarPaneSection } from "@plugins/primitives/plugins/app-shell/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import {
  DataView,
  defineDataView,
  type FieldDef,
} from "@plugins/primitives/plugins/data-view/web";
import { RelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import {
  updateDefinition,
  workflowDefinitionsDescriptor,
  type WorkflowDefinition,
} from "@plugins/apps/plugins/workflows/plugins/engine/core";
import { definitionDetailPane } from "../panes";
import { createDefinitionAndOpen } from "../internal/create-definition";

const WORKFLOWS_DEFINITIONS_VIEW = defineDataView("workflows.definitions");

export function WorkflowsSidebar() {
  const result = useResource(workflowDefinitionsDescriptor);
  const openPane = useOpenPane();
  const selectedId = definitionDetailPane.useRouteEntry()?.params.definitionId;

  const fields: FieldDef<WorkflowDefinition>[] = useMemo(
    () => [
      {
        id: "name",
        label: "Name",
        type: "text",
        primary: true,
        value: (d) => d.name,
        onEdit: async (d, next) => {
          await fetchEndpoint(
            updateDefinition,
            { id: d.id },
            { body: { name: String(next ?? "").trim() || "Untitled" } },
          );
        },
      },
      {
        id: "steps",
        label: "Steps",
        type: "number",
        align: "end",
        value: (d) => Object.keys(d.steps).length,
      },
      {
        id: "updatedAt",
        label: "Updated",
        value: (d) => d.updatedAt,
        cell: (d) => <RelativeTime date={new Date(d.updatedAt)} />,
      },
    ],
    [],
  );

  // One render path for both states: while loading, DataView renders its
  // skeleton and the chrome stays stable — the empty state requires
  // confirmed-empty (mirrors the servers list).
  const renderList = (defs: WorkflowDefinition[], loading: boolean) => (
    <DataView<WorkflowDefinition>
      rows={defs}
      fields={fields}
      rowKey={(d) => d.id}
      views={["list"]}
      defaultView="list"
      storageKey={WORKFLOWS_DEFINITIONS_VIEW}
      loading={loading}
      selectedRowId={selectedId}
      onRowActivate={(d) =>
        openPane(definitionDetailPane, { definitionId: d.id }, { mode: "push" })
      }
      emptyState="No workflows yet. Create one to get started."
    />
  );

  return (
    <SidebarPaneSection title="Workflows" icon={MdSchema} labelExtra={WorkflowsHeaderAdd}>
      <Scroll fill className="py-xs">
        {matchResource(result, {
          pending: () => renderList([], true),
          error: () => renderList([], true),
          ready: (defs) => renderList(defs, false),
        })}
      </Scroll>
    </SidebarPaneSection>
  );
}

/**
 * Header "+" for the Workflows section: a hover-revealed action that creates a
 * new definition and opens it. Rendered via `SidebarPaneSection`'s `labelExtra`
 * slot — `stopPropagation` keeps a click from toggling the section.
 */
function WorkflowsHeaderAdd() {
  const openPane = useOpenPane();
  return (
    <ControlSizeProvider size="xs">
      <IconButton
        icon={MdAdd}
        label="New workflow"
        onClick={(e) => {
          e.stopPropagation();
          return createDefinitionAndOpen(openPane);
        }}
        variant="ghost"
        // eslint-disable-next-line spacing/no-adhoc-spacing -- push the hover-reveal add affordance to the trailing edge of the section header label
        className="ml-auto opacity-0 pointer-events-none group-hover/label:opacity-100 group-hover/label:pointer-events-auto focus-visible:opacity-100 focus-visible:pointer-events-auto"
      />
    </ControlSizeProvider>
  );
}
