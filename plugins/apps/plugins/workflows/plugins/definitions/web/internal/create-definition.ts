import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import type { OpenPaneFn } from "@plugins/primitives/plugins/pane/web";
import { createDefinition } from "@plugins/apps/plugins/workflows/plugins/engine/core";
import { definitionDetailPane } from "../panes";

/** Create a fresh empty workflow definition and open its detail pane. */
export async function createDefinitionAndOpen(openPane: OpenPaneFn) {
  const def = await fetchEndpoint(
    createDefinition,
    {},
    { body: { name: "Untitled workflow" } },
  );
  openPane(definitionDetailPane, { definitionId: def.id }, { mode: "push" });
}
