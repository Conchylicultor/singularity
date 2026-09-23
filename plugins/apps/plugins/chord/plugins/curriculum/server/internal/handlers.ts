import { db } from "@plugins/database/server";
import { HttpError, implement } from "@plugins/infra/plugins/endpoints/server";
import {
  applyCellEndpoint,
  cellSelection,
  setBlanksEndpoint,
  setChapterStateEndpoint,
  setChordStateEndpoint,
  withBlanks,
  withChapterState,
  withChordState,
  type Selection,
} from "../../core";
import { updateSelection } from "./state";

export const handleSetChordState = implement(
  setChordStateEndpoint,
  async ({ body }) => {
    await updateSelection(db, (s) => withChordState(s, body.token, body.state));
  },
);

export const handleSetChapterState = implement(
  setChapterStateEndpoint,
  async ({ body }) => {
    await updateSelection(db, (s) => {
      const change = withChapterState(s, body.chapter, body.state);
      if (!change.ok) throw new HttpError(409, change.reason);
      return change.selection;
    });
  },
);

export const handleSetBlanks = implement(
  setBlanksEndpoint,
  async ({ body }) => {
    await updateSelection(db, (s) => withBlanks(s, body.blanks));
  },
);

export const handleApplyCell = implement(
  applyCellEndpoint,
  async ({ body }) => {
    // `cellSelection` throws on a chapter or row the path does not have: a
    // client that names one is out of date, which is a bad request.
    let next: Selection;
    try {
      next = cellSelection(body.cell);
    } catch (err) {
      if (err instanceof Error) throw new HttpError(400, err.message);
      throw err;
    }
    await updateSelection(db, () => next);
  },
);
