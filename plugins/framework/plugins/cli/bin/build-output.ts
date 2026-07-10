import { writeSync } from "node:fs";
import type { BuildStepLog } from "./build-logs-writer";

type Stream = "stdout" | "stderr";

export interface StepStatus {
  label: string;
  success: boolean;
}

export type Verdict =
  | { ok: true; headline: string; notes: string[]; pointers: string[]; steps: StepStatus[] }
  | { ok: false; headline: string; reason: string[]; pointers: string[]; steps: StepStatus[] };

// The single renderer for one step's transcript, shared by the console
// (build.ts:printStepResults) and by build.log (build-logs-writer.ts). Every
// replayed line is prefixed with `│ ` so a borrowed `✓ built` reads as a quoted
// `│ ✓ built`, never mistakable for the build's own verdict. Each line keeps its
// own stream tag so stderr still routes to stderr on the console.
export function renderStepBlock(step: BuildStepLog): Array<{ text: string; stream: Stream }> {
  const icon = step.success ? "✓" : "✗";
  const duration = (step.durationMs / 1000).toFixed(1);
  const header = `── ${step.label} ${icon} (${duration}s) `;
  const pad = Math.max(0, 60 - header.length);
  const out: Array<{ text: string; stream: Stream }> = [
    { text: header + "─".repeat(pad), stream: "stdout" },
  ];
  for (const line of step.lines) {
    out.push({ text: `│ ${line.text}`, stream: line.stream });
  }
  return out;
}

// Successes first, failures last, stable within each group so the failing step
// is the last quoted block a reader sees. Display-only — never applied to the
// JSON `steps` array, which stays in push order for its downstream consumers.
export function orderStepsForDisplay<T extends { success: boolean }>(steps: readonly T[]): T[] {
  return [...steps.filter((s) => s.success), ...steps.filter((s) => !s.success)];
}

// Pure. Returns the full banner. `pointers` are always the final lines so an
// agent reading only `| tail` lands on the log paths.
export function renderVerdict(v: Verdict): string {
  const body = v.ok ? v.notes : v.reason;
  const indent = (s: string): string => `  ${s}`;

  const headlineLine = indent(v.headline);
  const bodyLines = body.map(indent);
  const rosterLine = indent(v.steps.map((s) => `${s.label} ${s.success ? "✓" : "✗"}`).join("   "));
  const pointerLines = v.pointers.map(indent);

  const width = Math.max(
    60,
    headlineLine.length,
    ...bodyLines.map((l) => l.length),
    ...(v.steps.length > 0 ? [rosterLine.length] : []),
    ...pointerLines.map((l) => l.length),
  );

  const box = [
    `╔${"═".repeat(width)}╗`,
    `║${headlineLine.padEnd(width)}║`,
    `╚${"═".repeat(width)}╝`,
  ];

  const sections: string[][] = [box];
  if (bodyLines.length > 0) sections.push(bodyLines);
  if (v.steps.length > 0) sections.push([rosterLine]);
  if (pointerLines.length > 0) sections.push(pointerLines);

  return sections.map((s) => s.join("\n")).join("\n\n");
}

let emittedVerdict: { ok: boolean } | null = null;

// Prints the build's own verdict to stdout for BOTH success and failure so it
// can never be hidden by `2>/dev/null` and survives `| tail`. writeSync (not
// console.log) because a following process.exit() can truncate buffered writes.
export function emitVerdict(v: Verdict): void {
  emittedVerdict = { ok: v.ok };
  writeSync(1, `\n${renderVerdict(v)}\n`);
}

// Pure. Given what (if anything) was emitted and the actual exit code, returns
// the fallback verdict the exit-time guard should print, or `null` when the
// emitted verdict already agrees with the exit code and nothing more is needed.
// `null` covers exactly the two agreeing cases — (ok:true, code 0) and
// (ok:false, code≠0); every other combination yields a loud FAILED verdict.
// Extracted from installVerdictGuard so the fallback wording is unit-testable.
export function fallbackVerdict(
  emitted: { ok: boolean } | null,
  code: number,
  ctx: { url: string; buildLogPath: string },
): Verdict | null {
  if (emitted?.ok === true && code === 0) return null;
  if (emitted?.ok === false && code !== 0) return null;

  const pointers = [`Full output: ${ctx.buildLogPath}`];
  let headline: string;
  let reason: string[];
  if (emitted === null && code !== 0) {
    headline = `BUILD FAILED — aborted before completing (exit ${code})`;
    reason = [
      `NOT DEPLOYED. Nothing was published; ${ctx.url} still serves the previous build.`,
      `The build aborted before printing its own verdict.`,
    ];
  } else if (emitted === null) {
    headline = `BUILD FAILED — exited 0 without deploying. This is a bug in build.ts.`;
    reason = [
      `NOT DEPLOYED, yet the process exited 0 — the success signal is unreliable.`,
      `The build exited without printing a verdict.`,
    ];
  } else if (emitted.ok === false) {
    headline = `BUILD FAILED — the build failed but exited 0. This is a bug in build.ts.`;
    reason = [
      `The build printed a FAILED verdict but the process exited 0.`,
      `Trust the verdict: nothing was deployed.`,
    ];
  } else {
    headline = `BUILD FAILED — reported success but exited ${code}. This is a bug in build.ts.`;
    reason = [
      `The build printed an OK verdict but the process exited ${code}.`,
      `The deploy state is ambiguous — verify ${ctx.url} manually.`,
    ];
  }
  return { ok: false, headline, reason, pointers, steps: [] };
}

// process.on("exit") backstop: the build cannot terminate without a verdict, and
// a verdict that disagrees with the exit code prints a loud bug banner. Register
// once, after `name`/`buildId` (and after finalizeBuildLog's own exit hook) exist.
// Thin wrapper over the pure `fallbackVerdict`.
export function installVerdictGuard(ctx: { url: string; buildLogPath: string }): void {
  process.on("exit", (code) => {
    // Bun silently ignores process.exitCode reassignment inside an exit handler,
    // so this guard can only report a wrong code, never repair it.
    const v = fallbackVerdict(emittedVerdict, code, ctx);
    if (v !== null) writeSync(1, `\n${renderVerdict(v)}\n`);
  });
}
