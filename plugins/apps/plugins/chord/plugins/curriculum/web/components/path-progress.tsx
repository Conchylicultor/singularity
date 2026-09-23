import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import {
  CHAPTERS,
  cellName,
  cellStanding,
  chapterById,
  nextCell,
  routeOf,
  sameCell,
} from "../../core";
import type { StandingLookup } from "./path-card";
import "./path.css";

/**
 * The progress bar under "Your chords": one segment per step the path suggests
 * in the chapter the learner is in — done, next, or still ahead. Hovering a
 * segment names its step. Once every step is mastered, the last chapter shows
 * full.
 */
export function PathProgress({ standing }: { standing: StandingLookup }) {
  const next = nextCell(standing);
  const chapter = next === null ? CHAPTERS.at(-1) : chapterById(next.chapter);
  if (chapter === undefined) throw new Error("the path has no chapter");
  return (
    <Line className="gap-xs" aria-label={`${chapter.name}: your progress`}>
      {routeOf(chapter).map((cell) => {
        const done = cellStanding(cell, standing)?.mastered === true;
        const isNext = next !== null && sameCell(next, cell);
        return (
          <Fill
            key={`${cell.row}-${cell.blanks}`}
            className="chord-path-step"
            data-state={done ? "done" : isNext ? "next" : undefined}
            title={cellName(cell)}
          />
        );
      })}
    </Line>
  );
}
