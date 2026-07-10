import { implement } from "@plugins/infra/plugins/endpoints/server";
import { putPageStarred } from "../../shared/endpoints";
import { setPageStarred } from "./mutations";

export const handlePutPageStarred = implement(putPageStarred, async ({ params, body }) => {
  await setPageStarred(params.pageId, body.starred);
});
