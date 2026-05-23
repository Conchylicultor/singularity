import { implement, HttpError } from "@plugins/infra/plugins/endpoints/core";
import { setConfigByPath, resetConfigByPath, acknowledgeConflictByPath, deleteOverrideByPath, getRawFileContent } from "@plugins/config_v2/server";
import { setConfigField } from "@plugins/config_v2/core";
import { resetConfigField, acknowledgeConflict, deleteOverride, getConfigRawFile } from "../../core";

export const handleSetField = implement(setConfigField, async ({ body }) => {
  try {
    setConfigByPath(body.storePath, body.key, body.value);
  } catch (err) {
    throw new HttpError(400, err instanceof Error ? err.message : String(err));
  }
});

export const handleResetField = implement(resetConfigField, async ({ body }) => {
  try {
    resetConfigByPath(body.storePath, body.key);
  } catch (err) {
    throw new HttpError(400, err instanceof Error ? err.message : String(err));
  }
});

export const handleAcknowledgeConflict = implement(acknowledgeConflict, async ({ body }) => {
  try {
    acknowledgeConflictByPath(body.storePath);
  } catch (err) {
    throw new HttpError(400, err instanceof Error ? err.message : String(err));
  }
});

export const handleDeleteOverride = implement(deleteOverride, async ({ body }) => {
  try {
    deleteOverrideByPath(body.storePath);
  } catch (err) {
    throw new HttpError(400, err instanceof Error ? err.message : String(err));
  }
});

export const handleGetRawFile = implement(getConfigRawFile, async ({ query }) => {
  try {
    return getRawFileContent(query.storePath);
  } catch (err) {
    throw new HttpError(400, err instanceof Error ? err.message : String(err));
  }
});
