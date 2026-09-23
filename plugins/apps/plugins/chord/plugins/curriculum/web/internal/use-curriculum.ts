import {
  getEndpointErrorMessage,
  useEndpointMutation,
} from "@plugins/infra/plugins/endpoints/web";
import {
  useResource,
  type ResourceResult,
} from "@plugins/primitives/plugins/live-state/web";
import { showToast } from "@plugins/shell/plugins/toast/web";
import type { ChordToken } from "@plugins/apps/plugins/chord/plugins/song-index/core";
import {
  applyCellEndpoint,
  chordCurriculumResource,
  setBlanksEndpoint,
  setChapterStateEndpoint,
  setChordStateEndpoint,
  type Blanks,
  type Cell,
  type ChordState,
  type Selection,
} from "../../core";

// ── Reading and changing the selection from the browser ──────────────────────
//
// The selection is live (the server pushes every change), so the writes answer
// nothing: the resource brings the new value to every open tab. A refused write
// is a toast with the server's sentence, never a silent nothing.

/** What the learner has chosen. `pending` until the server's first value lands. */
export function useCurriculum(): ResourceResult<Selection> {
  return useResource(chordCurriculumResource);
}

/** The four writes, and whether one is still out. */
export type CurriculumWrites = {
  setChordState: (token: ChordToken, state: ChordState) => void;
  setChapterState: (chapter: string, state: ChordState) => void;
  setBlanks: (blanks: Blanks) => void;
  applyCell: (cell: Cell) => void;
  pending: boolean;
};

export function useCurriculumWrites(): CurriculumWrites {
  const onError = (err: Parameters<typeof getEndpointErrorMessage>[0]) =>
    showToast({
      title: "Your practice settings could not be changed",
      description: getEndpointErrorMessage(err),
      variant: "error",
    });
  const chord = useEndpointMutation(setChordStateEndpoint, { onError });
  const chapter = useEndpointMutation(setChapterStateEndpoint, { onError });
  const blanks = useEndpointMutation(setBlanksEndpoint, { onError });
  const cell = useEndpointMutation(applyCellEndpoint, { onError });
  return {
    setChordState: (token, state) => chord.mutate({ body: { token, state } }),
    setChapterState: (id, state) =>
      chapter.mutate({ body: { chapter: id, state } }),
    setBlanks: (value) => blanks.mutate({ body: { blanks: value } }),
    applyCell: (value) => cell.mutate({ body: { cell: value } }),
    pending:
      chord.isPending ||
      chapter.isPending ||
      blanks.isPending ||
      cell.isPending,
  };
}
