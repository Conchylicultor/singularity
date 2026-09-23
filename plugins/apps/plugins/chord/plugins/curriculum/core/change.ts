import type { ChordToken } from "@plugins/apps/plugins/chord/plugins/song-index/core";
import type { Blanks } from "./blanks";
import { chapterById } from "./path";
import type { ChordState, Selection } from "./selection";

// ── The writes, as pure functions over a selection ───────────────────────────
//
// The server applies these inside one transaction (`updateSelection`); being
// pure, they are what the tests check.

/** A change that can be refused: the reason is a sentence for the learner. */
export type SelectionChange =
  { ok: true; selection: Selection } | { ok: false; reason: string };

/** One chord to practise, hear only, or off. */
export function withChordState(
  selection: Selection,
  token: ChordToken,
  state: ChordState,
): Selection {
  const others = selection.chords.filter((c) => c.token !== token);
  return {
    ...selection,
    chords: state === "off" ? others : [...others, { token, state }],
  };
}

/**
 * Every chord of a chapter at once, and the key modes its rows open: on for
 * practise and hear, off for off. Refused when it would leave no key mode on —
 * no loop could play.
 */
export function withChapterState(
  selection: Selection,
  chapterId: string,
  state: ChordState,
): SelectionChange {
  const chapter = chapterById(chapterId);
  let next = selection;
  for (const row of chapter.rows) {
    for (const token of row.tokens) next = withChordState(next, token, state);
  }
  const opened = new Set(chapter.rows.flatMap((row) => row.modes));
  const modes =
    state === "off"
      ? next.modes.filter((mode) => !opened.has(mode))
      : [...new Set([...next.modes, ...opened])];
  if (modes.length === 0) {
    return {
      ok: false,
      reason: `Turning ${chapter.name} off would leave no key mode on, so no loop could play.`,
    };
  }
  return { ok: true, selection: { ...next, modes } };
}

export function withBlanks(selection: Selection, blanks: Blanks): Selection {
  return { ...selection, blanks };
}
