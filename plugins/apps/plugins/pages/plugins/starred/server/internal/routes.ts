import { implement } from "@plugins/infra/plugins/endpoints/server";
import { putPageStarred, movePageStarred } from "../../shared/endpoints";
import { setPageStarred, movePageStarred as moveStarredMutation } from "./mutations";

export const handlePutPageStarred = implement(putPageStarred, async ({ params, body }) => {
  await setPageStarred(params.pageId, body.starred);
});

export const handleMovePageStarred = implement(movePageStarred, async ({ params, body }) => {
  await moveStarredMutation(params.pageId, body.rank);
});
