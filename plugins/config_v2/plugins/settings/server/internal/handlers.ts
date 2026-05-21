import { implement, HttpError } from "@plugins/infra/plugins/endpoints/core";
import { setConfigByPath, resetConfigByPath } from "@plugins/config_v2/server";
import { setConfigField, resetConfigField } from "../../core";

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
