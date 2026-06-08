import { implement } from "@plugins/infra/plugins/endpoints/core";
import { disconnect } from "@plugins/auth/core";
import { disconnectAccount } from "../actions";

/** POST /api/auth/disconnect/:provider */
export const handleDisconnect = implement(disconnect, async ({ params, body }) => {
  await disconnectAccount(params.provider, body.accountId);
});
