import { matchResource, useResource } from "@plugins/primitives/plugins/live-state/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { workflowExecutionsDescriptor } from "@plugins/apps/plugins/workflows/plugins/engine/core";
import { definitionsRootPane } from "@plugins/apps/plugins/workflows/plugins/definitions/web";
import { ExecutionDetail } from "./components/execution-detail";

function useResolveExecution({ executionId }: { executionId: string }) {
  const result = useResource(workflowExecutionsDescriptor);
  if (result.pending) return { pending: true, found: false };
  return { pending: false, found: result.data.some((e) => e.id === executionId) };
}

export const executionDetailPane = Pane.define({
  id: "workflows-execution-detail",
  defaultAncestors: [definitionsRootPane],
  segment: "exec/:executionId",
  component: ExecutionDetailBody,
  resolve: useResolveExecution,
});

function ExecutionDetailBody() {
  const { executionId } = executionDetailPane.useParams();
  const result = useResource(workflowExecutionsDescriptor);

  return matchResource(result, {
    pending: () => (
      <PaneChrome pane={executionDetailPane} title="Execution">
        <Loading variant="rows" />
      </PaneChrome>
    ),
    ready: (executions) => {
      const execution = executions.find((e) => e.id === executionId) ?? null;
      if (!execution) {
        return (
          <PaneChrome pane={executionDetailPane} title="Execution">
            <Text as="div" variant="body" className="text-muted-foreground p-lg">
              Execution not found.
            </Text>
          </PaneChrome>
        );
      }
      return (
        <PaneChrome pane={executionDetailPane} title={`Execution ${executionId.slice(0, 8)}`}>
          <ExecutionDetail execution={execution} />
        </PaneChrome>
      );
    },
  });
}
