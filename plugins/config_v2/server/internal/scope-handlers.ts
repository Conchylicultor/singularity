import { implement, HttpError } from "@plugins/infra/plugins/endpoints/core";
import { forkScope as forkScopeEndpoint, deleteScope as deleteScopeEndpoint } from "../../core";
import { forkScope, deleteScope } from "./scope-fork";

export const handleForkScope = implement(forkScopeEndpoint, async ({ body }) => {
  try {
    await forkScope(body.scopeId);
  } catch (err) {
    throw new HttpError(400, err instanceof Error ? err.message : String(err));
  }
});

export const handleDeleteScope = implement(deleteScopeEndpoint, async ({ body }) => {
  try {
    await deleteScope(body.scopeId);
  } catch (err) {
    throw new HttpError(400, err instanceof Error ? err.message : String(err));
  }
});
