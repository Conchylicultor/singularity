import { implement } from "@plugins/infra/plugins/endpoints/server";
import { addBookmark, deleteBookmark } from "../../shared/endpoints";
import {
  addBookmark as addBookmarkMutation,
  deleteBookmark as deleteBookmarkMutation,
} from "./mutations";

export const handleAddBookmark = implement(addBookmark, async ({ body }) => {
  await addBookmarkMutation(body.url, body.title);
});

export const handleDeleteBookmark = implement(deleteBookmark, async ({ params }) => {
  await deleteBookmarkMutation(params.id);
});
