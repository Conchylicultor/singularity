/** One step of the simulated agent loop, replayed on launch. */
export interface Stage {
  id: "worktree" | "edit" | "build" | "merge";
  label: string;
  /** Terminal-style caption shown while this stage is active. */
  log: string;
  /** How long the stage takes, in ms. */
  ms: number;
}

/** The fixed agent loop every task races through: worktree → edit → build → merge. */
export const STAGES: Stage[] = [
  { id: "worktree", label: "Worktree", log: "git worktree add …", ms: 900 },
  { id: "edit", label: "Edit", log: "editing 3 files…", ms: 1400 },
  { id: "build", label: "Build", log: "./singularity build ✓", ms: 1100 },
  { id: "merge", label: "Merge", log: "merged to main", ms: 700 },
];

export type RunStatus = "idle" | "running" | "done";

/** Per-task run state. `stage` is the index into STAGES currently in progress (or STAGES.length once done). */
export interface RunState {
  status: RunStatus;
  stage: number;
}

/** A fake task in the demo list. `subtasks`, when present, check off as the run crosses stages. */
export interface DemoTask {
  id: string;
  title: string;
  subtasks?: [string, string];
}

export const TASKS: DemoTask[] = [
  {
    id: "dark-mode",
    title: "Add dark mode to the reader",
    subtasks: ["Wire the theme toggle", "Ship the merged tokens"],
  },
  { id: "inbox-scroll", title: "Fix flaky inbox scroll" },
  { id: "piano-demo", title: "Ship the piano demo" },
];
