import { implement } from "@plugins/infra/plugins/endpoints/server";
import { setStoryMark, clearStoryMark } from "../../shared/endpoints";
import { setStoryMark as setStoryMarkMutation } from "./mutations";

export const handleSetStoryMark = implement(setStoryMark, async ({ params, body }) => {
  await setStoryMarkMutation(params.pageId, { defaultRendererId: body.defaultRendererId ?? null });
});

export const handleClearStoryMark = implement(clearStoryMark, async ({ params }) => {
  await setStoryMarkMutation(params.pageId, null);
});
