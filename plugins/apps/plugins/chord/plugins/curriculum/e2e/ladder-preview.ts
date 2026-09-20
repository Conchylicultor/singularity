// Walks the curriculum ladder from level 1 against the songs this checkout's
// deploy has indexed, and prints the first N levels as a table — the step each
// level adds, the family it comes from, how many loop windows it opens, and how
// many the learner can play once they have it.
//
// This is how the ORDER gets reviewed by eye: "does minor really come before
// 7ths?", "is that chord worth a level of its own?". The ranking is meant to
// come from the songs rather than from anyone's taste, so it has to be readable
// as a list of steps and what each one is worth.
//
// It changes nothing. The learner's own ladder lives in `chord_unlocks`, and
// this never writes it: the walk happens in memory — start from FIRST_LEVEL,
// ask the index what each possible step is worth, let the same pure chooser the
// server runs pick one, apply it to the standing, repeat. Every call it makes
// is a read; it does not even `ensure` the index, which records a request row
// and can start a load.
//
// Usage:
//   ./singularity run plugins/apps/plugins/chord/plugins/curriculum/e2e/ladder-preview.ts
//   ./singularity run plugins/apps/plugins/chord/plugins/curriculum/e2e/ladder-preview.ts --levels 30
//   … [--url http://<namespace>.localhost:9000]
//
// Refuses when the index is not `ready`: an empty ladder printed over an
// unloaded index would read as "there is nothing left to learn".

import { z } from "zod";
import {
  numArg,
  report,
  usage,
} from "@plugins/framework/plugins/tooling/plugins/e2e-harness/e2e";
import {
  DEFAULT_LOOP_SHAPE,
  IndexStatusSchema,
  NEXT_CHORDS_MAX_LIMIT,
  NextChordCountSchema,
  windowsInModes,
  type ChordToken,
  type IndexStatus,
} from "@plugins/apps/plugins/chord/plugins/song-index/core";
import {
  postJson,
  readStatus,
} from "@plugins/apps/plugins/chord/plugins/song-index/e2e";
import { chordLabel } from "@plugins/apps/plugins/chord/plugins/vocabulary/core";
import type { HookpadMode } from "@plugins/integrations/plugins/hooktheory/core";
import {
  ASK_RULES,
  FIRST_LEVEL,
  askRuleStep,
  chooseNextStep,
  curriculumFromSteps,
  minStepWindows,
  stageById,
  unopenedStages,
  type Curriculum,
  type LadderCounts,
  type NextStep,
  type NextStepChoice,
} from "@plugins/apps/plugins/chord/plugins/curriculum/core";

const r = report("chord curriculum — the ladder");
const levels = numArg("levels", 20);
if (!Number.isInteger(levels) || levels < 1) {
  usage(`--levels expects a whole number of levels, at least 1, got ${levels}`);
}

// ── The two index reads, over HTTP ───────────────────────────────────────────
//
// The script is a client, so the counts come over the wire rather than from the
// server barrel the curriculum itself calls. Both reads take the chord set as a
// parameter, which is what lets this ask about a set the learner does not have.

const NotReadySchema = z.object({
  kind: z.literal("not-ready"),
  status: IndexStatusSchema,
});

const NextChordsResponseSchema = z.discriminatedUnion("kind", [
  NotReadySchema,
  z.object({
    kind: z.literal("ready"),
    nextChords: z.array(NextChordCountSchema),
  }),
]);

const CountInSetResponseSchema = z.discriminatedUnion("kind", [
  NotReadySchema,
  z.object({ kind: z.literal("ready"), windows: z.number().int() }),
]);

/** Time spent waiting on the app, and how many reads that took. */
const http = { calls: 0, ms: 0 };

async function timed<T>(run: () => Promise<T>): Promise<T> {
  const started = performance.now();
  try {
    return await run();
  } finally {
    http.calls += 1;
    http.ms += performance.now() - started;
  }
}

/** Windows a learner holding exactly these chords, in these modes, could be given. */
async function countInSet(
  unlocked: readonly ChordToken[],
  modes: readonly HookpadMode[],
): Promise<number> {
  const answer = CountInSetResponseSchema.parse(
    await timed(() =>
      postJson("/api/chord/loops/count-in-set", {
        unlocked,
        modes,
        shape: DEFAULT_LOOP_SHAPE,
      }),
    ),
  );
  if (answer.kind !== "ready") {
    throw new Error(
      `count-in-set answered not-ready mid-walk: ${JSON.stringify(answer.status)}`,
    );
  }
  return answer.windows;
}

/**
 * What the index says each possible step is worth, gathered exactly as the
 * server's own `next` read gathers it: one `next-chords` scan for the pool
 * chords, and one count per family the learner has not opened.
 *
 * `reach` is the baseline those counts are measured against — a family's entry
 * is worth the windows it opens ON TOP of what is already playable, which is
 * what makes "minor keys" a bigger step than "one more major triad" instead of
 * a number that counts the same songs twice. The caller has it already, so it
 * is passed in rather than counted a second time.
 */
async function gatherCounts(
  curriculum: Curriculum,
  reach: number,
  indexWindows: number,
): Promise<LadderCounts> {
  const unlocked = curriculum.unlocked.map((u) => u.token);
  const modes = curriculum.modes;
  const closed = unopenedStages(new Set(unlocked), new Set(modes));

  const [rows, entryTotals] = await Promise.all([
    timed(() =>
      postJson("/api/chord/loops/next-chords", {
        unlocked,
        shape: DEFAULT_LOOP_SHAPE,
        limit: NEXT_CHORDS_MAX_LIMIT,
      }),
    ).then((body) => NextChordsResponseSchema.parse(body)),
    Promise.all(
      closed.map((stage) =>
        countInSet(
          [...new Set([...unlocked, ...stage.seed])],
          [...new Set([...modes, ...stage.modes])],
        ),
      ),
    ),
  ]);
  if (rows.kind !== "ready") {
    throw new Error(
      `next-chords answered not-ready mid-walk: ${JSON.stringify(rows.status)}`,
    );
  }

  return {
    candidates: rows.nextChords.map((row) => ({
      token: row.token,
      windows: windowsInModes(row, modes),
    })),
    entries: closed.map((stage, index) => {
      const total = entryTotals[index];
      if (total === undefined) {
        throw new Error(
          `No window count came back for the ${stage.id} family, one of the ${closed.length} asked for`,
        );
      }
      return { stage: stage.id, windows: Math.max(0, total - reach) };
    }),
    indexWindows,
  };
}

// ── How a step reads ─────────────────────────────────────────────────────────

/** The step in the learner's words: the chords it adds, or how much it asks for. */
function stepLabel(step: NextStep): string {
  if (step.kind === "ask") {
    return step.rule === "half" ? "name the cadence" : "name the whole loop";
  }
  const chords = step.tokens.map((token) => chordLabel(token).text).join(" ");
  const keys = step.modes.map((mode) => `${mode} keys`).join(", ");
  if (chords === "") return keys;
  return keys === "" ? chords : `${chords} + ${keys}`;
}

/** The family the step comes from. An ask-rule step belongs to none. */
function stepFamily(step: NextStep): string | null {
  return step.kind === "ask" ? null : stageById(step.stage).title;
}

/** Level 1, written the same way a step is: it is the major-triads family opened. */
const START = {
  kind: "chords",
  stage: FIRST_LEVEL.stage,
  tokens: [...FIRST_LEVEL.tokens],
  modes: [...FIRST_LEVEL.modes],
} satisfies NextStep;

// ── The index has to be loaded ───────────────────────────────────────────────

type ReadyIndex = Extract<IndexStatus, { kind: "ready" }>;

async function requireReadyIndex(): Promise<ReadyIndex> {
  const status = await readStatus();
  if (status.kind === "ready") {
    r.ok("the song index is ready", true);
    return status;
  }
  r.fail(
    "the song index is ready",
    `it is ${JSON.stringify(status)} — open the chord app (or run the song index's own e2e script) to load it, then run this again`,
  );
  // Never returns: `finish` prints the verdict and exits non-zero.
  return r.finish();
}

const index = await requireReadyIndex();
r.note(
  `index: ${index.scope} scope, ${index.sections.toLocaleString()} sections, ${index.windows.toLocaleString()} ${DEFAULT_LOOP_SHAPE} windows`,
);
const threshold = minStepWindows(index.windows);
r.note(
  `a step must open at least ${threshold} windows to be worth taking (1 in 10,000 of the index, never under 5)`,
);

// ── The walk ─────────────────────────────────────────────────────────────────

type Row = {
  level: number;
  label: string;
  /** The family the step came from, or null for an ask-rule step, which is in none. */
  family: string | null;
  /** Windows the step that arrived here opened. Null at level 1, and for an ask-rule step. */
  opens: number | null;
  /** Windows playable at this level. */
  reach: number;
  /** How long this level's reads took, in milliseconds. */
  ms: number;
};

const rows: Row[] = [];
const steps: NextStep[] = [];
/** The step that arrived at the level being printed, and what it opened. */
let arrived: { step: NextStep; windows: number } | null = null;
/** The level at which nothing was left worth unlocking, when that happened. */
let ranOut: number | null = null;

for (let level = 1; ; level += 1) {
  const curriculum = curriculumFromSteps(steps);
  if (curriculum.level !== level) {
    throw new Error(
      `the walk is at level ${level}, but its ${steps.length} steps read back as level ${curriculum.level}`,
    );
  }
  const unlocked = curriculum.unlocked.map((u) => u.token);
  const spentBefore = http.ms;

  // What is playable here — also the baseline a family's entry is measured
  // against, so the gather below reuses it rather than counting twice.
  const reach = await countInSet(unlocked, curriculum.modes);
  const row: Row = {
    level,
    label: stepLabel(arrived?.step ?? START),
    family: stepFamily(arrived?.step ?? START),
    opens:
      arrived === null || arrived.step.kind === "ask" ? null : arrived.windows,
    reach,
    ms: 0,
  };
  rows.push(row);

  if (level >= levels) {
    row.ms = http.ms - spentBefore;
    break;
  }

  // The ask ladder first, and it needs no scan: while the round does not yet
  // ask for the whole loop, no chord step can win.
  const rung = askRuleStep(curriculum.askRule);
  const choice: NextStepChoice =
    rung !== null
      ? { kind: "step", step: rung, windows: 0 }
      : chooseNextStep(
          {
            unlocked,
            modes: curriculum.modes,
            askRule: curriculum.askRule,
            stage: curriculum.stage,
          },
          await gatherCounts(curriculum, reach, index.windows),
        );
  row.ms = http.ms - spentBefore;

  if (choice.kind === "done") {
    ranOut = level;
    break;
  }
  steps.push(choice.step);
  arrived = { step: choice.step, windows: choice.windows };
}

// ── The table ────────────────────────────────────────────────────────────────

const COLUMNS = ["level", "label", "family", "opens", "reach", "ms"] as const;
type Column = (typeof COLUMNS)[number];

const cell: Record<Column, (row: Row) => string> = {
  level: (row) => String(row.level),
  label: (row) => row.label,
  family: (row) => row.family ?? "—",
  opens: (row) => (row.opens === null ? "—" : row.opens.toLocaleString()),
  reach: (row) => row.reach.toLocaleString(),
  ms: (row) => `${Math.round(row.ms)} ms`,
};

const HEADER: Record<Column, string> = {
  level: "lvl",
  label: "step",
  family: "family",
  opens: "opens",
  reach: "can play",
  ms: "read",
};

/** Numbers read down their last digit; words read down their first letter. */
const RIGHT_ALIGNED: ReadonlySet<Column> = new Set<Column>([
  "level",
  "opens",
  "reach",
  "ms",
]);

const widthOf = (column: Column): number =>
  Math.max(
    HEADER[column].length,
    ...rows.map((row) => cell[column](row).length),
  );

const line = (of: (column: Column) => string): string =>
  COLUMNS.map((column) =>
    RIGHT_ALIGNED.has(column)
      ? of(column).padStart(widthOf(column))
      : of(column).padEnd(widthOf(column)),
  )
    .join("  ")
    .trimEnd();

r.note("");
r.note(line((column) => HEADER[column]));
r.note(line((column) => "─".repeat(widthOf(column))));
for (const row of rows) r.note(line((column) => cell[column](row)));
r.note("");

// ── The summary ──────────────────────────────────────────────────────────────

const byFamily = new Map<string, { levels: number; first: number }>();
let askLevels = 0;
for (const row of rows) {
  if (row.family === null) {
    askLevels += 1;
    continue;
  }
  const seen = byFamily.get(row.family);
  if (seen === undefined) {
    byFamily.set(row.family, { levels: 1, first: row.level });
  } else {
    seen.levels += 1;
  }
}

r.note(`${rows.length} levels walked, ${steps.length} steps taken:`);
for (const [family, seen] of byFamily) {
  r.note(
    `  ${family}: ${seen.levels} level${seen.levels === 1 ? "" : "s"}, first at level ${seen.first}`,
  );
}
if (askLevels > 0) {
  r.note(
    `  how much you name: ${askLevels} level${askLevels === 1 ? "" : "s"} (the cadence, then the whole loop)`,
  );
}

const firstRow = rows[0];
const lastRow = rows.at(-1);
if (firstRow !== undefined && lastRow !== undefined) {
  r.note(
    `can play: ${firstRow.reach.toLocaleString()} windows at level 1 → ${lastRow.reach.toLocaleString()} at level ${lastRow.level}, of ${index.windows.toLocaleString()} in the index`,
  );
}

const perLevel = rows.map((row) => row.ms).sort((a, b) => a - b);
const median = perLevel[Math.floor(perLevel.length / 2)];
r.note(
  `${http.calls} reads, ${Math.round(http.ms)} ms in total — ${median === undefined ? "?" : Math.round(median)} ms median per level, ${Math.round(Math.max(...perLevel))} ms at the slowest`,
);

if (ranOut !== null) {
  // Legal: a worktree loads a 5 % sample of the songs and can genuinely run out
  // of chords worth unlocking. On the full index it should not happen this early.
  r.note(
    `the ladder ran out at level ${ranOut}: nothing left opens ${threshold} windows. Expected on a sample, not on the full index.`,
  );
}

// ── What the walk must hold to ───────────────────────────────────────────────

r.ok("the ladder takes at least one step", steps.length > 0, "no step taken");

const below = rows.filter((row) => row.opens !== null && row.opens < threshold);
r.ok(
  "every chord step opens at least the threshold",
  below.length === 0,
  below
    .map((row) => `level ${row.level}: ${row.label} opens ${row.opens}`)
    .join("; "),
);

r.ok(
  "what the learner can play never shrinks",
  rows.every((row, i) => {
    const before = rows[i - 1];
    return before === undefined || row.reach >= before.reach;
  }),
  JSON.stringify(rows.map((row) => row.reach)),
);

const unlockedTokens = steps.flatMap((step) =>
  step.kind === "chords" ? step.tokens : [],
);
r.ok(
  "no chord is unlocked twice",
  new Set(unlockedTokens).size === unlockedTokens.length,
  unlockedTokens.join(" "),
);

// The rungs are climbed once each, first: a new chord never arrives before the
// learner names the whole loop. ASK_RULES counts `target` too, and everyone
// starts there, so it is one rung fewer than there are rules.
const RUNGS = ASK_RULES.length - 1;
r.ok(
  "the ask ladder is climbed before any chord arrives",
  steps.every((step, i) =>
    i < RUNGS ? step.kind === "ask" : step.kind === "chords",
  ),
  steps.map((step) => step.kind).join(" "),
);

await r.finish();
