import { implement } from "@plugins/infra/plugins/endpoints/core";
import { getToken } from "@plugins/auth/core";
import { getAccessTokenInternal } from "../token-access";

export const handleGetToken = implement(getToken, async ({ body }) => {
  return getAccessTokenInternal(body);
});
