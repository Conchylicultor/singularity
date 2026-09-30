import type { StatusDotPaint } from "@plugins/primitives/plugins/css/plugins/status-dot/web";
import type { BackgroundShellState } from "../../core";

export interface ShellStateDisplay {
  /** Sentence case — the jsonl-viewer bans all-caps and Title Case labels. */
  label: string;
  dot: StatusDotPaint;
  /** A live clock while running, a frozen total once ended — or no time at all. */
  clock: "live" | "total" | "none";
}

function exitLabel(prefix: string | null, exitCode: number | null): string {
  if (exitCode === null) return prefix ?? "Ended";
  return prefix === null ? `exit ${exitCode}` : `${prefix} · exit ${exitCode}`;
}

/**
 * The ONE display reading of a shell's state, so the band row, the `Bash`
 * card and the output pane cannot disagree about what a shell is doing.
 *
 * Live is a filled dot; every ended state is a hollow ring, coloured by how it
 * ended. A clean `exit 0` needs no word beyond its code; a failure says so.
 */
export function shellStateDisplay(
  state: BackgroundShellState,
): ShellStateDisplay {
  switch (state.kind) {
    case "running":
      return {
        label: "Running",
        dot: { colorClass: "bg-success" },
        clock: "live",
      };
    case "completed":
      return {
        label: exitLabel(
          state.exitCode === null ? "Completed" : null,
          state.exitCode,
        ),
        dot: { ringClass: "border-faint-foreground" },
        clock: "total",
      };
    case "failed":
      return {
        label: exitLabel("Failed", state.exitCode),
        dot: { ringClass: "border-destructive" },
        clock: "total",
      };
    case "killed":
      return {
        label: "Killed",
        dot: { ringClass: "border-warning" },
        clock: "total",
      };
    case "ended-unrecognized":
      return {
        label: exitLabel(`Ended (${state.status})`, state.exitCode),
        dot: { ringClass: "border-warning" },
        clock: "total",
      };
    case "ended-without-reporting":
      return {
        label: "Ended without reporting",
        dot: { ringClass: "border-warning" },
        // No end time is on record, so no total can be stated.
        clock: "none",
      };
  }
}
