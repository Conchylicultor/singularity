import { implement, HttpError } from "@plugins/infra/plugins/endpoints/core";
import { setConfigByPath, resetConfigByPath, acknowledgeConflictByPath, deleteOverrideByPath, mergeConflictByPath, getRawFileContent } from "@plugins/config_v2/server";
import { setConfigField } from "@plugins/config_v2/core";
import { resetConfigField, acknowledgeConflict, deleteOverride, mergeConflict, getConfigRawFile } from "../../core";

export const handleSetField = implement(setConfigField, async ({ body }) => {
  try {
    await setConfigByPath(body.storePath, body.key, body.value, body.scopeId);
  } catch (err) {
    throw new HttpError(400, err instanceof Error ? err.message : String(err));
  }
});

export const handleResetField = implement(resetConfigField, async ({ body }) => {
  try {
    await resetConfigByPath(body.storePath, body.key, body.scopeId);
  } catch (err) {
    throw new HttpError(400, err instanceof Error ? err.message : String(err));
  }
});

export const handleAcknowledgeConflict = implement(acknowledgeConflict, async ({ body }) => {
  try {
    acknowledgeConflictByPath(body.storePath, body.scopeId);
  } catch (err) {
    throw new HttpError(400, err instanceof Error ? err.message : String(err));
  }
});

export const handleDeleteOverride = implement(deleteOverride, async ({ body }) => {
  try {
    deleteOverrideByPath(body.storePath, body.scopeId);
  } catch (err) {
    throw new HttpError(400, err instanceof Error ? err.message : String(err));
  }
});

export const handleMergeConflict = implement(mergeConflict, async ({ body }) => {
  try {
    return mergeConflictByPath(body.storePath, body.scopeId);
  } catch (err) {
    throw new HttpError(400, err instanceof Error ? err.message : String(err));
  }
});

export const handleGetRawFile = implement(getConfigRawFile, async ({ query }) => {
  try {
    return getRawFileContent(query.storePath, query.scopeId);
  } catch (err) {
    throw new HttpError(400, err instanceof Error ? err.message : String(err));
  }
});
