import {
  matchResource,
  useResource,
} from "@plugins/primitives/plugins/live-state/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { defineRoute } from "@plugins/primitives/plugins/pane/core";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { workflowsApp } from "@plugins/apps/plugins/workflows/plugins/shell/core";
import { workflowDefinitionsDescriptor } from "@plugins/apps/plugins/workflows/plugins/engine/core";
import { DefinitionDetail } from "./components/definition-detail";

/**
 * The Workflows landing route. Its segment is empty because an index pane is
 * reached at the app's base path and owns no URL fragment of its own.
 *
 * Exported because it is the parent of BOTH the definition detail route below
 * and the execution detail route in the executions plugin — chaining is what
 * puts this app's root in those URLs and types their params as the full set.
 */
export const definitionsRootRoute = defineRoute({
  id: "workflows-definitions",
  segment: "",
});

export const definitionsRootPane = Pane.define({
  route: definitionsRootRoute,
  app: workflowsApp,
  // The Workflows app's index/landing pane — what its bare root (/workflows)
  // resolves to.
  appIndex: true,
  component: DefinitionsRoot,
  width: 320,
});

function useResolveDefinition({ definitionId }: { definitionId: string }) {
  const result = useResource(workflowDefinitionsDescriptor);
  if (result.pending) return { pending: true, found: false };
  return {
    pending: false,
    found: result.data.some((d) => d.id === definitionId),
  };
}

const definitionDetailRoute = defineRoute({
  id: "workflows-definition-detail",
  segment: "def/:definitionId",
  parent: definitionsRootRoute,
});

export const definitionDetailPane = Pane.define({
  route: definitionDetailRoute,
  app: workflowsApp,
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
            <Text
              as="div"
              variant="body"
              className="text-muted-foreground p-lg"
            >
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
