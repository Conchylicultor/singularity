/**
 * The conversation field vocabulary against the collections it is declared
 * with: the fields marked `sortable` are exactly `CONVERSATION_SORTABLE` (a
 * field marked sortable over a column the collection does not sort throws at
 * mount, on the All-conversations pane and on History — and a sortable column
 * no field offers is dead), every field that names a filterable column is
 * declared, and the search columns are filterable text.
 *
 * Run: `./singularity test plugins/conversations/plugins/all-conversations`.
 */

import { describe, expect, test } from "bun:test";
import {
  CONVERSATION_FIELDS,
  CONVERSATION_FILTERABLE,
  CONVERSATION_SEARCHABLE,
  CONVERSATION_SORTABLE,
} from "./fields";
import { allConversations, conversationHistory } from "./collection";

describe("conversation fields", () => {
  test("the sortable fields are exactly CONVERSATION_SORTABLE", () => {
    const sortable = CONVERSATION_FIELDS.filter(
      (f) => "sortable" in f && f.sortable === true,
    ).map((f) => f.id);
    expect([...sortable].sort()).toEqual([...CONVERSATION_SORTABLE].sort());
  });

  test("every field is a filterable column", () => {
    for (const f of CONVERSATION_FIELDS) {
      expect(Object.keys(CONVERSATION_FILTERABLE)).toContain(f.id);
    }
  });

  test("every search column is filterable text", () => {
    for (const c of CONVERSATION_SEARCHABLE) {
      expect(CONVERSATION_FILTERABLE[c].domain).toBe("text");
    }
  });

  test("both collections take the vocabulary, each scoped to its surface", () => {
    for (const c of [allConversations, conversationHistory]) {
      expect([...c.sortable]).toEqual([...CONVERSATION_SORTABLE]);
      expect(Object.keys(c.filterable)).toEqual(
        Object.keys(CONVERSATION_FILTERABLE),
      );
    }
    expect(allConversations.columnScope).toBe("all-conversations");
    expect(conversationHistory.columnScope).toBe("conversations-sidebar");
  });
});
