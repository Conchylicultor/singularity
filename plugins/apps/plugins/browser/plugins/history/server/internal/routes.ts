import { implement } from "@plugins/infra/plugins/endpoints/server";
import { postBrowserHistory } from "../../shared/endpoints";
import { recordVisit } from "./mutations";

export const handlePostBrowserHistory = implement(postBrowserHistory, async ({ body }) => {
  await recordVisit(body.url);
});
