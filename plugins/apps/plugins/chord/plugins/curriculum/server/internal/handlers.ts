import { db } from "@plugins/database/server";
import { implement } from "@plugins/infra/plugins/endpoints/server";
import {
  setBlanksEndpoint,
  setChordsEndpoint,
  setExtrasEndpoint,
  withBlanks,
  withChordChanges,
  withExtras,
} from "../../core";
import { updateSelection } from "./state";

export const handleSetChords = implement(
  setChordsEndpoint,
  async ({ body }) => {
    await updateSelection(db, (s) => withChordChanges(s, body.changes));
  },
);

export const handleSetBlanks = implement(
  setBlanksEndpoint,
  async ({ body }) => {
    await updateSelection(db, (s) => withBlanks(s, body.blanks));
  },
);

export const handleSetExtras = implement(
  setExtrasEndpoint,
  async ({ body }) => {
    await updateSelection(db, (s) => withExtras(s, body.extras));
  },
);
