import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { createExecution } from "@plugins/apps/plugins/workflows/plugins/engine/core";

export function RunDefinitionButton({ definitionId }: { definitionId: string }) {
  async function handleRun() {
    await fetchEndpoint(createExecution, {}, { body: { definitionId } });
  }
  return (
    <Button variant="default" onClick={handleRun}>
      Run
    </Button>
  );
}
