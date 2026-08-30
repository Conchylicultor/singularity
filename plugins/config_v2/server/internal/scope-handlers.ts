import { implement, HttpError } from "@plugins/infra/plugins/endpoints/core";
import {
  forkScope as forkScopeEndpoint,
  deleteScope as deleteScopeEndpoint,
  forkDescriptorScope as forkDescriptorScopeEndpoint,
  removeDescriptorScope as removeDescriptorScopeEndpoint,
} from "../../core";
import { originOf } from "@plugins/infra/plugins/request-origin/core";
import {
  forkScope,
  deleteScope,
  forkDescriptorScope,
  removeDescriptorScope,
} from "./scope-fork";

export const handleForkScope = implement(
  forkScopeEndpoint,
  async ({ body, req }) => {
    try {
      await forkScope(body.scopeId, { writer: originOf(req) });
    } catch (err) {
      throw new HttpError(
        400,
        err instanceof Error ? err.message : String(err),
      );
    }
  },
);

export const handleDeleteScope = implement(
  deleteScopeEndpoint,
  async ({ body, req }) => {
    try {
      await deleteScope(body.scopeId, { writer: originOf(req) });
    } catch (err) {
      throw new HttpError(
        400,
        err instanceof Error ? err.message : String(err),
      );
    }
  },
);

export const handleForkDescriptorScope = implement(
  forkDescriptorScopeEndpoint,
  async ({ body, req }) => {
    try {
      await forkDescriptorScope(body.storePath, body.scopeId, {
        writer: originOf(req),
      });
    } catch (err) {
      throw new HttpError(
        400,
        err instanceof Error ? err.message : String(err),
      );
    }
  },
);

export const handleRemoveDescriptorScope = implement(
  removeDescriptorScopeEndpoint,
  async ({ body, req }) => {
    try {
      await removeDescriptorScope(body.storePath, body.scopeId, {
        writer: originOf(req),
      });
    } catch (err) {
      throw new HttpError(
        400,
        err instanceof Error ? err.message : String(err),
      );
    }
  },
);
