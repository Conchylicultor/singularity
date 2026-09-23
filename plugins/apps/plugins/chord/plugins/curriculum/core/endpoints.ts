import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";
import { ChordTokenSchema } from "@plugins/apps/plugins/chord/plugins/song-index/core";
import { BlanksSchema } from "./blanks";
import { ChordStateSchema } from "./selection";

// ── Changing the selection ───────────────────────────────────────────────────
//
// Four writes, each one transaction. None answers with the new selection: the
// live `chord.curriculum` resource pushes it to every open tab.

/** Set one chord to practise, hear only, or off. */
export const setChordStateEndpoint = defineEndpoint({
  route: "POST /api/chord/curriculum/chord",
  body: z.object({ token: ChordTokenSchema, state: ChordStateSchema }),
});

/**
 * Set every chord of a chapter at once, and turn the key modes it opens on
 * (practise, hear) or off. Refused when it would leave no key mode on.
 */
export const setChapterStateEndpoint = defineEndpoint({
  route: "POST /api/chord/curriculum/chapter",
  body: z.object({ chapter: z.string().min(1), state: ChordStateSchema }),
});

/** How much of the loop is blank. */
export const setBlanksEndpoint = defineEndpoint({
  route: "POST /api/chord/curriculum/blanks",
  body: z.object({ blanks: BlanksSchema }),
});

export const CellSchema = z.object({
  chapter: z.string().min(1),
  row: z.string().min(1),
  blanks: BlanksSchema,
});

/**
 * Go to a cell of the path: the server works out what the cell means
 * (`cellSelection`) and replaces the whole selection with it. A client never
 * sends a whole selection it computed.
 */
export const applyCellEndpoint = defineEndpoint({
  route: "POST /api/chord/curriculum/cell",
  body: z.object({ cell: CellSchema }),
});
