import { implement, HttpError } from "@plugins/infra/plugins/endpoints/core";
import { forkScope as forkScopeEndpoint, deleteScope as deleteScopeEndpoint, forkDescriptorScope as forkDescriptorScopeEndpoint, removeDescriptorScope as removeDescriptorScopeEndpoint } from "../../core";
import { forkScope, deleteScope, forkDescriptorScope, removeDescriptorScope } from "./scope-fork";

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

export const handleForkDescriptorScope = implement(forkDescriptorScopeEndpoint, async ({ body }) => {
  try {
    await forkDescriptorScope(body.storePath, body.scopeId);
  } catch (err) {
    throw new HttpError(400, err instanceof Error ? err.message : String(err));
  }
});

export const handleRemoveDescriptorScope = implement(removeDescriptorScopeEndpoint, async ({ body }) => {
  try {
    await removeDescriptorScope(body.storePath, body.scopeId);
  } catch (err) {
    throw new HttpError(400, err instanceof Error ? err.message : String(err));
  }
});
