import { matchResource, useResource } from "@plugins/primitives/plugins/live-state/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { workflowsApp } from "@plugins/apps/plugins/workflows/plugins/shell/core";
import { workflowDefinitionsDescriptor } from "@plugins/apps/plugins/workflows/plugins/engine/core";
import { DefinitionDetail } from "./components/definition-detail";

export const definitionsRootPane = Pane.define({
  id: "workflows-definitions",
  // Empty segment + `appPath` makes this the Workflows app's index pane: bare /workflows.
  segment: "",
  appPath: workflowsApp.basePath,
  component: DefinitionsRoot,
  width: 320,
});

function useResolveDefinition({ definitionId }: { definitionId: string }) {
  const result = useResource(workflowDefinitionsDescriptor);
  if (result.pending) return { pending: true, found: false };
  return { pending: false, found: result.data.some((d) => d.id === definitionId) };
}

export const definitionDetailPane = Pane.define({
  id: "workflows-definition-detail",
  defaultAncestors: [definitionsRootPane],
  segment: "def/:definitionId",
  component: DefinitionDetailBody,
  resolve: useResolveDefinition,
});

function DefinitionsRoot() {
  return (
    <PaneChrome pane={definitionsRootPane} title="Workflows">
      <Text as="div" variant="body" className="text-muted-foreground p-lg">
        Select or create a workflow.
      </Text>
    </PaneChrome>
  );
}

function DefinitionDetailBody() {
  const { definitionId } = definitionDetailPane.useParams();
  const result = useResource(workflowDefinitionsDescriptor);

  return matchResource(result, {
    pending: () => (
      <PaneChrome pane={definitionDetailPane} title="Workflow">
        <Loading variant="rows" />
      </PaneChrome>
    ),
    ready: (defs) => {
      const def = defs.find((d) => d.id === definitionId) ?? null;
      if (!def) {
        return (
          <PaneChrome pane={definitionDetailPane} title="Workflow">
            <Text as="div" variant="body" className="text-muted-foreground p-lg">
              Workflow not found.
            </Text>
          </PaneChrome>
        );
      }
      return (
        <PaneChrome pane={definitionDetailPane} title={def.name}>
          <DefinitionDetail definitionId={definitionId} def={def} />
        </PaneChrome>
      );
    },
  });
}
